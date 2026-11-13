import type { Hotspot, Room } from '../../domain';
import type { Renderer } from '../renderer';
import type { Session } from '../session';
import { createDialoguePanel, type DialogueBackend } from './dialogue';
import { createHotspotLayer } from './hotspots';
import { createEditor, type EditorHost } from './edit';
import { createInventoryBar } from './inventory';
import { createOverlay } from './overlay';
import { createProgress } from './progress';
import { createSpeech } from './speech';
import { createUiBar } from './uiBar';
import { createWorldSwitcher, type WorldSwitcher } from './worlds';

export type { DialogueBackend } from './dialogue';
export type { EditIssue, EditorHost } from './edit';

export interface Ui {
  /** The renderer has drawn the session's room and takes input there: lay the room's controls over it. */
  shown(): void;
  /** The player clicked the room's floor: nothing is hovered any more. */
  walked(): void;
  /** The pointer is over a hotspot the renderer picked on its canvas, or over none. */
  pointed(hotspot: string | null): void;
}

/**
 * All of the game's text and controls, as DOM over the canvas (docs/ARCHITECTURE.md, section 5):
 * the UI bar, the career stats and the act's goals, the inventory, the speech line and the
 * dialogue panel, which talks to `dialogue`, each following the session itself, and the room's
 * controls (its hotspot buttons and the world switcher) while the room is drawn. A new part is
 * created here and appended to the overlay's root. The overlay lines up with the renderer's
 * canvas. The name of the hotspot under the pointer goes to `on.hover`, and the player leaving a
 * conversation (Leave or Escape) to `on.left`. The owner gets the Edit button and its edit mode,
 * which works through `editor`.
 */
export function mountUi(
  container: HTMLElement,
  session: Session,
  renderer: Pick<Renderer, 'picksHotspots' | 'canvas' | 'onResize' | 'hotspotBounds' | 'anchor' | 'frame' | 'snapshot'>,
  on: { hover(name: string): void; left(): void },
  dialogue: DialogueBackend,
  editor: EditorHost | null = null,
): Ui {
  const doc = container.ownerDocument;
  const overlay = createOverlay(container);
  const bar = createUiBar(doc, session, on);
  const inventory = createInventoryBar(doc, session, { hover: (id) => bar.hoverItem(id) });
  const speech = createSpeech(doc, session, renderer);
  const conversation = createDialoguePanel(doc, session, dialogue, on);
  const progress = createProgress(doc, session);
  overlay.root.append(
    progress.goals,
    bar.element,
    progress.stats,
    inventory.element,
    speech.element,
    conversation.element,
  );
  /** The shown room's controls; none from a room change until the new room is shown. */
  let controls: RoomControls | null = null;
  const layOut = (current: Room) => {
    controls?.destroy();
    controls = createRoomControls(doc, session, renderer, current, inventory.element, bar);
  };
  if (editor) {
    // Edits move hotspots: their buttons go where they are now.
    const left = () => {
      const current = session.content.rooms[session.state.room];
      if (controls && current) layOut(current);
    };
    overlay.root.append(createEditor(doc, session, renderer, editor, overlay.root, { left }));
  }
  /** The hotspot the pointer is over on the canvas, while the renderer picks hotspots. */
  let pointedAt: string | null = null;
  session.subscribe((event) => {
    if (event.type !== 'roomChanged') return;
    controls?.destroy();
    controls = null;
    pointedAt = null;
  });

  return {
    shown() {
      const current = session.content.rooms[session.state.room];
      if (!current) throw new Error(`room "${session.state.room}" is not in the content`);
      overlay.follow(renderer);
      speech.shown();
      bar.show(current);
      layOut(current);
    },
    walked() {
      pointedAt = null;
      bar.hover(null);
    },
    pointed(hotspot) {
      if (!controls || hotspot === pointedAt) return;
      pointedAt = hotspot;
      const current = session.content.rooms[session.state.room];
      bar.hover(current?.hotspots.find((h) => h.id === hotspot) ?? null);
    },
  };
}

interface RoomControls {
  /** Takes the controls away and stops following the session. */
  destroy(): void;
}

/**
 * The controls of a room the renderer has drawn: a button for each hotspot in it, at its bounds,
 * and the world switcher. In the order a keyboard reaches them: the hotspots, then `inventory`,
 * then the worlds. A hotspot that comes into the room or leaves it gets or loses its button, and
 * the switcher is made again when a world unlocks. The hotspot under the pointer or focus goes
 * to `on.hover`.
 */
function createRoomControls(
  doc: Document,
  session: Session,
  renderer: Pick<Renderer, 'hotspotBounds' | 'picksHotspots'>,
  room: Room,
  inventory: HTMLElement,
  on: { hover(h: Hotspot | null): void },
): RoomControls {
  const hotspots = createHotspotLayer(
    doc,
    room.hotspots.filter((h) => session.isPresent(h)),
    (h) => renderer.hotspotBounds(h.id),
    renderer.picksHotspots,
    { hover: (h) => on.hover(h), activate: (h) => session.dispatch({ type: 'activate', hotspot: h.id }) },
  );
  inventory.before(hotspots.element);
  let switcher: WorldSwitcher | null = null;
  const showWorlds = () => {
    switcher?.destroy();
    switcher = createWorldSwitcher(doc, session.content.worlds, room.world, (w) => session.isUnlocked(w), {
      enter: (w) => session.dispatch({ type: 'enterWorld', world: w.id }),
    });
    inventory.after(switcher.element);
  };
  showWorlds();

  const unsubscribe = session.subscribe((event) => {
    if (event.type === 'hotspotShown') {
      const shown = room.hotspots.find((h) => h.id === event.hotspot);
      if (shown) hotspots.add(shown);
    } else if (event.type === 'hotspotHidden') {
      hotspots.remove(event.hotspot);
    } else if (event.type === 'worldUnlocked') {
      showWorlds();
    }
  });
  return {
    destroy() {
      unsubscribe();
      hotspots.destroy();
      switcher?.destroy();
    },
  };
}
