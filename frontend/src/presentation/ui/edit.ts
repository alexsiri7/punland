import {
  addCorner,
  type FloorPoint,
  type Handle,
  type Hotspot,
  handlesOf,
  MIN_CORNERS,
  moveHandle,
  type PublishResult,
  type Rect,
  removeCorner,
  type Room,
  type RoomLayout,
  sameLayout,
} from '../../domain';
import type { Renderer } from '../renderer';
import type { Session } from '../session';
import { fonts, palette, SCENE_HEIGHT, SCENE_WIDTH } from '../theme';

/** A problem with an edit, by the content file and field it would break. */
export interface EditIssue {
  file: string;
  field: string;
  message: string;
}

/**
 * What the edit mode asks of the app (editor spec, "Edit mode" and "Publishing a room"), which
 * keeps the drafts, checks them and plays them.
 */
export interface EditorHost {
  /** The room's layout now: its draft's, or the deployed room's. */
  layout(room: string): RoomLayout;
  /** The deployed room's layout, before any edit. */
  base(room: string): RoomLayout;
  /** Whether a point of the scene is on the room's floor: a dragged point goes nowhere else. */
  onFloor(at: FloorPoint): boolean;
  /** Keeps the room's draft and plays it if it holds together; the problems with it, if any. */
  change(room: string, layout: RoomLayout): readonly EditIssue[];
  /** Forgets the room's draft and plays the deployed room. */
  discard(room: string): void;
  /** Pauses the game while editing, and plays on after. */
  editing(on: boolean): void;
  /** Stands the room's characters and objects where a layout has them, for a screenshot. */
  preview(room: string, layout: RoomLayout): void;
  /** Publishes the room's draft with its before/after screenshots (base64 PNG). */
  publish(room: string, layout: RoomLayout, shots: { before: string; after: string }): Promise<PublishResult>;
}

/** What the editor draws over the room: its floor, its hotspots' click areas and its points. */
type LayoutShape =
  | { kind: 'floor'; points: readonly FloorPoint[] }
  | { kind: 'area'; rect: Rect; label: string; present: boolean }
  | { kind: 'point'; handle: Handle; at: FloorPoint; label: string };

/** The issues listed under the toolbar; the rest are counted. */
const SHOWN_ISSUES = 5;
const NUDGE = 1;
const BIG_NUDGE = 10;
const SVG = 'http://www.w3.org/2000/svg';

/**
 * The owner's Edit button (editor spec) and the edit mode it opens, also with the E key: the
 * game pauses, every hotspot's click area, the floor's outline and every point of the room's
 * layout show over the scene, and the points can be dragged (on the floor only) or nudged with
 * the arrow keys. Each change goes to `host`, which plays it live; the toolbar undoes, redoes,
 * adds and removes floor corners, discards and publishes. Pressing Edit again goes back to play,
 * and `on.left` lays the room's controls out again. While editing, the rest of `root` is inert.
 */
export function createEditor(
  doc: Document,
  session: Session,
  renderer: Pick<Renderer, 'hotspotBounds' | 'snapshot'>,
  host: EditorHost,
  root: HTMLElement,
  on: { left(): void },
): HTMLButtonElement {
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'edit-button';
  button.textContent = 'Edit';
  button.setAttribute('aria-pressed', 'false');
  /** Each room's undo and redo history, for this page. */
  const histories = new Map<string, { undo: RoomLayout[]; redo: RoomLayout[] }>();
  let open: EditMode | null = null;

  const toggle = () => {
    if (open) {
      open.close();
      open = null;
      for (const child of root.children) child.removeAttribute('inert');
      button.setAttribute('aria-pressed', 'false');
      host.editing(false);
      on.left();
      return;
    }
    const room = session.state.room;
    const current = session.content.rooms[room];
    if (!current) return;
    host.editing(true);
    for (const child of root.children) if (child !== button) child.setAttribute('inert', '');
    let history = histories.get(room);
    if (!history) histories.set(room, (history = { undo: [], redo: [] }));
    open = openEditMode(doc, session, renderer, host, room, current, history);
    button.before(open.element);
    button.setAttribute('aria-pressed', 'true');
  };
  button.addEventListener('click', toggle);
  doc.addEventListener('keydown', (event) => {
    if (!button.isConnected || root.hidden || typing(event.target)) return;
    if (event.key.toLowerCase() === 'e' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      toggle();
    } else if (open && event.key.toLowerCase() === 'z' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (event.shiftKey) open.redo();
      else open.undo();
    }
  });
  return button;
}

interface EditMode {
  readonly element: HTMLElement;
  undo(): void;
  redo(): void;
  close(): void;
}

function openEditMode(
  doc: Document,
  session: Session,
  renderer: Pick<Renderer, 'hotspotBounds' | 'snapshot'>,
  host: EditorHost,
  room: string,
  current: Room,
  history: { undo: RoomLayout[]; redo: RoomLayout[] },
): EditMode {
  const element = doc.createElement('div');
  element.className = 'editor';
  const layer = doc.createElement('div');
  layer.className = 'edit-layer';
  layer.setAttribute('role', 'region');
  layer.setAttribute('aria-label', 'Edit mode');
  const svg = doc.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const readout = doc.createElement('p');
  readout.className = 'edit-readout';
  layer.append(svg, readout);

  const toolbar = doc.createElement('div');
  toolbar.className = 'edit-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Editor');
  const tool = (label: string, action: () => void | Promise<void>) => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', () => void action());
    toolbar.append(b);
    return b;
  };
  const status = doc.createElement('p');
  status.className = 'edit-status';
  status.setAttribute('role', 'status');
  element.append(layer, toolbar, status);

  let layout = host.layout(room);
  let issues = host.change(room, layout);
  let selectedCorner: number | null = null;
  let publishing = false;
  const handles = new Map<string, HTMLButtonElement>();
  const listening = new AbortController();

  const shapes = (shown: RoomLayout) =>
    layoutShapes(current, shown, (id) => renderer.hotspotBounds(id), (h) => session.isPresent(h));

  /** Makes `next` the layout: the host plays it, and the undo history gets the one it replaces. */
  const change = (next: RoomLayout, undoable = true) => {
    if (sameLayout(next, layout)) return;
    if (undoable) {
      history.undo.push(layout);
      history.redo.length = 0;
    }
    layout = next;
    issues = host.change(room, layout);
    showStatus();
    render();
  };

  const undo = () => {
    const previous = publishing ? undefined : history.undo.pop();
    if (!previous) return;
    history.redo.push(layout);
    change(previous, false);
  };
  const redo = () => {
    const next = publishing ? undefined : history.redo.pop();
    if (!next) return;
    history.undo.push(layout);
    change(next, false);
  };
  const undoButton = tool('Undo', undo);
  const redoButton = tool('Redo', redo);
  const addButton = tool('Add corner', () => {
    const after = selectedCorner ?? layout.walkable.length - 1;
    change(addCorner(layout, after));
    selectedCorner = after + 1;
    render();
  });
  const removeButton = tool('Remove corner', () => {
    if (selectedCorner === null) return;
    change(removeCorner(layout, selectedCorner));
    selectedCorner = null;
    render();
  });
  const discardButton = tool('Discard', () => {
    host.discard(room);
    history.undo.length = 0;
    history.redo.length = 0;
    layout = host.layout(room);
    issues = host.change(room, layout);
    showStatus();
    render();
  });
  const publishButton = tool('Publish', async () => {
    if (issues.length > 0) {
      showStatus("Can't publish: ");
      return;
    }
    const shots = screenshots();
    if (!shots) {
      status.textContent = "Can't take the screenshots.";
      return;
    }
    publishing = true;
    status.textContent = 'Publishing…';
    render();
    const result = await host.publish(room, layout, shots);
    publishing = false;
    if (result.ok) {
      history.undo.length = 0;
      history.redo.length = 0;
      layout = host.layout(room);
      issues = host.change(room, layout);
      status.textContent = 'Published: ';
      const link = doc.createElement('a');
      link.href = result.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = result.url;
      status.append(link);
    } else {
      status.textContent = result.message;
    }
    render();
  });

  /** The room before the edits and after them, each with the layout drawn over it; both or neither. */
  const screenshots = (): { before: string; after: string } | null => {
    const shot = (shown: RoomLayout) => {
      host.preview(room, shown);
      const canvas = renderer.snapshot();
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return null;
      paintLayout(context, shapes(shown));
      return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
    };
    const before = shot(host.base(room));
    const after = shot(layout);
    host.preview(room, layout);
    return before && after ? { before, after } : null;
  };

  /** The issues with the draft, after `lead`, or nothing when it holds together. */
  function showStatus(lead = '') {
    if (issues.length === 0) {
      status.textContent = '';
      return;
    }
    const listed = issues.slice(0, SHOWN_ISSUES).map(({ file, field, message }) => `${file} ${field}: ${message}`);
    if (issues.length > SHOWN_ISSUES) listed.push(`and ${issues.length - SHOWN_ISSUES} more`);
    status.textContent = lead + listed.join('; ');
  }

  const toScene = (event: PointerEvent): FloorPoint => {
    const box = layer.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) * SCENE_WIDTH) / box.width,
      y: ((event.clientY - box.top) * SCENE_HEIGHT) / box.height,
    };
  };

  /** A handle's button: dragged with the pointer, nudged with the arrow keys. */
  const handleButton = (handle: Handle, label: string) => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = `edit-handle is-${handle.kind}`;
    b.setAttribute('aria-label', label);
    let dragFrom: RoomLayout | null = null;
    const signal = listening.signal;
    b.addEventListener(
      'pointerdown',
      (event) => {
        event.preventDefault();
        b.setPointerCapture?.(event.pointerId);
        b.focus();
        dragFrom = layout;
        if (handle.kind === 'corner') selectedCorner = handle.index;
        render();
      },
      { signal },
    );
    b.addEventListener(
      'pointermove',
      (event) => {
        if (!dragFrom) return;
        const to = toScene(event);
        if (!host.onFloor(to)) return;
        change(moveHandle(layout, handle, to), false);
      },
      { signal },
    );
    const drop = () => {
      if (!dragFrom) return;
      if (!sameLayout(dragFrom, layout)) {
        history.undo.push(dragFrom);
        history.redo.length = 0;
      }
      dragFrom = null;
      render();
    };
    b.addEventListener('pointerup', drop, { signal });
    b.addEventListener('pointercancel', drop, { signal });
    b.addEventListener(
      'keydown',
      (event) => {
        const step = event.shiftKey ? BIG_NUDGE : NUDGE;
        const by = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[
          event.key
        ];
        const from = handlesOf(layout).find((h) => sameHandle(h.handle, handle))?.at;
        if (!by || !from) return;
        event.preventDefault();
        const to = { x: from.x + (by[0] ?? 0), y: from.y + (by[1] ?? 0) };
        if (host.onFloor(to)) change(moveHandle(layout, handle, to));
      },
      { signal },
    );
    b.addEventListener(
      'focus',
      () => {
        if (handle.kind === 'corner') selectedCorner = handle.index;
        render();
      },
      { signal },
    );
    b.addEventListener('blur', () => (readout.hidden = true), { signal });
    return b;
  };

  function render() {
    const drawn = shapes(layout);
    svg.replaceChildren(...drawn.flatMap((shape) => svgShape(doc, shape)));
    const seen = new Set<string>();
    readout.hidden = true;
    for (const shape of drawn) {
      if (shape.kind !== 'point') continue;
      const key = JSON.stringify(shape.handle);
      seen.add(key);
      let b = handles.get(key);
      if (!b) {
        b = handleButton(shape.handle, shape.label);
        handles.set(key, b);
        layer.append(b);
      }
      b.style.left = `${(100 * shape.at.x) / SCENE_WIDTH}%`;
      b.style.top = `${(100 * shape.at.y) / SCENE_HEIGHT}%`;
      b.classList.toggle('is-selected', shape.handle.kind === 'corner' && shape.handle.index === selectedCorner);
      if (doc.activeElement === b) {
        readout.hidden = false;
        readout.textContent = `${shape.at.x}, ${shape.at.y}`;
        readout.style.left = b.style.left;
        readout.style.top = b.style.top;
      }
    }
    for (const [key, b] of handles) {
      if (seen.has(key)) continue;
      b.remove();
      handles.delete(key);
    }
    const edited = !sameLayout(layout, host.base(room));
    undoButton.disabled = publishing || history.undo.length === 0;
    redoButton.disabled = publishing || history.redo.length === 0;
    addButton.disabled = publishing;
    removeButton.disabled = publishing || selectedCorner === null || layout.walkable.length <= MIN_CORNERS;
    discardButton.disabled = publishing || !edited;
    publishButton.disabled = publishing || !edited;
  }

  showStatus();
  render();
  return {
    element,
    undo,
    redo,
    close() {
      listening.abort();
      element.remove();
    },
  };
}

/** What the editor draws for a room's layout: the floor, each hotspot's click area (from `bounds`), and each point. */
function layoutShapes(
  room: Room,
  layout: RoomLayout,
  bounds: (hotspot: string) => Rect | null,
  present: (hotspot: Hotspot) => boolean,
): LayoutShape[] {
  const areas = room.hotspots.flatMap((h): LayoutShape[] => {
    const rect = bounds(h.id);
    return rect ? [{ kind: 'area', rect, label: exitTo(h) ?? h.name, present: present(h) }] : [];
  });
  const name = (id: string) => room.hotspots.find((h) => h.id === id)?.name ?? id;
  const points = handlesOf(layout).map(({ handle, at }): LayoutShape => {
    const label =
      handle.kind === 'start'
        ? 'Start'
        : handle.kind === 'corner'
          ? `Floor corner ${handle.index + 1}`
          : `${name(handle.hotspot)} ${handle.kind === 'spot' ? 'spot' : 'walk-to'}`;
    return { kind: 'point', handle, at, label };
  });
  return [{ kind: 'floor', points: layout.walkable }, ...areas, ...points];
}

/** "→ <room>" for an exit: a hotspot that leads to another room. */
function exitTo(h: Hotspot): string | null {
  for (const { effects } of h.interactions) {
    for (const effect of effects) if ('goTo' in effect) return `→ ${effect.goTo}`;
  }
  return null;
}

/** Draws the shapes on a 1280 x 640 canvas, as the edit mode shows them, for the screenshots. */
function paintLayout(context: CanvasRenderingContext2D, shapes: readonly LayoutShape[]): void {
  context.save();
  context.lineWidth = 3;
  context.font = `500 16px ${fonts.ui}`;
  for (const shape of shapes) {
    if (shape.kind === 'floor') {
      context.strokeStyle = palette.signGold;
      context.beginPath();
      for (const p of shape.points) context.lineTo(p.x, p.y);
      context.closePath();
      context.stroke();
    } else if (shape.kind === 'area') {
      context.globalAlpha = shape.present ? 1 : 0.4;
      context.strokeStyle = palette.uiText;
      context.setLineDash([8, 6]);
      context.strokeRect(shape.rect.x, shape.rect.y, shape.rect.width, shape.rect.height);
      context.setLineDash([]);
      context.fillStyle = palette.uiText;
      const label = labelAt(shape.rect);
      context.fillText(shape.label, label.x, label.y);
      context.globalAlpha = 1;
    } else {
      context.fillStyle = POINT_COLOURS[shape.handle.kind];
      context.strokeStyle = palette.castShadow;
      context.beginPath();
      context.arc(shape.at.x, shape.at.y, 8, 0, 2 * Math.PI);
      context.fill();
      context.stroke();
    }
  }
  context.restore();
}

const POINT_COLOURS: Record<Handle['kind'], string> = {
  start: palette.windowGlow,
  corner: palette.signGold,
  walkTo: palette.mutedText,
  spot: palette.horizonClay,
};

function svgShape(doc: Document, shape: LayoutShape): SVGElement[] {
  const make = (name: string, attributes: Record<string, string | number>) => {
    const element = doc.createElementNS(SVG, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
    return element;
  };
  if (shape.kind === 'floor') {
    return [make('polygon', { class: 'edit-floor', points: shape.points.map((p) => `${p.x},${p.y}`).join(' ') })];
  }
  if (shape.kind === 'area') {
    const { x, y, width, height } = shape.rect;
    const area = make('rect', { class: `edit-area${shape.present ? '' : ' is-absent'}`, x, y, width, height });
    const label = make('text', { class: `edit-label${shape.present ? '' : ' is-absent'}`, ...labelAt(shape.rect) });
    label.textContent = shape.label;
    return [area, label];
  }
  return [];
}

/** Where an area's name goes: in its top left corner, kept in the scene. */
function labelAt(rect: Rect): { x: number; y: number } {
  return { x: Math.max(rect.x, 0) + 4, y: Math.max(rect.y, 0) + 18 };
}

function sameHandle(a: Handle, b: Handle): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Whether a key goes into a text field rather than to the game. */
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.matches('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
}
