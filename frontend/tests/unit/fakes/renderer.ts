import type { FloorPoint, Rect } from '../../../src/domain';
import type { AnimationName, Pick, Renderer, ScenePoint, SceneView } from '../../../src/presentation/renderer';
import { SCENE_HEIGHT, SCENE_WIDTH, UI_BAR_HEIGHT } from '../../../src/presentation/theme';

/** Each hotspot's bounds in scene pixels, by its room's scene model: fixed, as no model is drawn. */
const BOUNDS: Readonly<Record<string, Readonly<Record<string, Rect>>>> = {
  'scene/opening': {
    door: { x: 634, y: 208, width: 142, height: 312 },
    board: { x: 868, y: 452, width: 100, height: 110 },
    cop: { x: 1040, y: 360, width: 80, height: 190 },
    street: { x: 412, y: 400, width: 92, height: 144 },
  },
  'scene/pub': {
    door: { x: 60, y: 138, width: 162, height: 332 },
    bartender: { x: 940, y: 164, width: 140, height: 192 },
    'sheryl-caw': { x: 700, y: 390, width: 80, height: 145 },
    'second-crow': { x: 790, y: 390, width: 80, height: 145 },
    'third-crow': { x: 880, y: 390, width: 80, height: 145 },
    stage: { x: 240, y: 430, width: 470, height: 52 },
    fame: { x: 496, y: 160, width: 200, height: 180 },
    rival: { x: 430, y: 330, width: 80, height: 204 },
  },
  'scene/high-street': {
    back: { x: 60, y: 380, width: 90, height: 160 },
    shop: { x: 440, y: 262, width: 120, height: 256 },
    'lesson-flyer': { x: 914, y: 505, width: 32, height: 40 },
    intercom: { x: 838, y: 380, width: 30, height: 46 },
    'flat-door': { x: 700, y: 290, width: 112, height: 228 },
    mayor: { x: 1110, y: 380, width: 90, height: 160 },
  },
  'scene/music-shop': {
    door: { x: 60, y: 150, width: 160, height: 330 },
    rival: { x: 820, y: 330, width: 80, height: 205 },
    strings: { x: 760, y: 170, width: 160, height: 100 },
  },
  'scene/flat': {
    door: { x: 60, y: 150, width: 160, height: 330 },
    'song-master': { x: 780, y: 385, width: 80, height: 155 },
  },
  'scene/mayors-office': {
    door: { x: 60, y: 150, width: 160, height: 330 },
    mayor: { x: 930, y: 310, width: 100, height: 230 },
  },
  'scene/feed': {
    page: { x: 400, y: 40, width: 480, height: 460 },
    likes: { x: 960, y: 430, width: 80, height: 90 },
  },
  'scene/dream': {
    stage: { x: 600, y: 316, width: 440, height: 136 },
    'stolen-song': { x: 780, y: 340, width: 92, height: 205 },
  },
};

/** A hotspot's bounds in the room drawn from the scene model `scene`, as the fake renderer gives them. */
export function fakeBounds(scene: string, hotspot: string): Rect | null {
  return BOUNDS[scene]?.[hotspot] ?? null;
}

/** A call the renderer was told to make, by method name. */
export type RendererCall =
  | { method: 'mount' }
  | { method: 'show'; view: SceneView }
  | { method: 'setPlayer'; at: FloorPoint; facing: 'left' | 'right' }
  | { method: 'setVisible'; hotspot: string; visible: boolean }
  | { method: 'play'; who: string; clip: AnimationName };

/**
 * A renderer for jsdom (docs/ARCHITECTURE.md, section 5): it draws nothing and records what it
 * is told. Each view is drawn at once. Its canvas is the scene and the UI bar at the page's origin, so a
 * pointer's client position is in scene pixels, and frames come only from `step`.
 */
export class FakeRenderer implements Renderer {
  readonly calls: RendererCall[] = [];
  readonly picksHotspots: boolean = false;
  private element: HTMLCanvasElement | null = null;
  protected view: SceneView | null = null;
  private at: FloorPoint = { x: 0, y: 0 };
  private readonly frames = new Set<(dtMs: number) => void>();

  async mount(container: HTMLElement): Promise<void> {
    this.calls.push({ method: 'mount' });
    const canvas = container.ownerDocument.createElement('canvas');
    canvas.getBoundingClientRect = () => new DOMRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT + UI_BAR_HEIGHT);
    container.append(canvas);
    this.element = canvas;
  }

  async show(view: SceneView): Promise<void> {
    this.calls.push({ method: 'show', view });
    this.view = view;
    this.at = view.player.at;
  }

  setPlayer(at: FloorPoint, facing: 'left' | 'right'): void {
    this.calls.push({ method: 'setPlayer', at, facing });
    this.at = at;
  }

  setVisible(hotspot: string, visible: boolean): void {
    this.calls.push({ method: 'setVisible', hotspot, visible });
  }

  play(who: string, clip: AnimationName): void {
    this.calls.push({ method: 'play', who, clip });
  }

  pick(screen: ScenePoint): Pick {
    if (!this.view || screen.y >= SCENE_HEIGHT) return { kind: 'none' };
    return { kind: 'floor', at: { x: screen.x, y: screen.y } };
  }

  hotspotBounds(hotspot: string): Rect | null {
    return this.view && fakeBounds(this.view.model, hotspot);
  }

  /** The player's head is 200 scene px over their feet. */
  anchor(who: string, name: 'head' | 'hand_r'): ScenePoint | null {
    if (who !== 'player' || name !== 'head') return null;
    return { x: this.at.x, y: this.at.y - 200 };
  }

  canvas(): HTMLCanvasElement {
    if (!this.element) throw new Error('the renderer is not mounted');
    return this.element;
  }

  onResize(): () => void {
    return () => {};
  }

  frame(callback: (dtMs: number) => void): () => void {
    this.frames.add(callback);
    return () => this.frames.delete(callback);
  }

  destroy(): void {
    this.element?.remove();
    this.frames.clear();
  }

  /** Runs one frame of `dtMs`. */
  step(dtMs: number): void {
    for (const frame of this.frames) frame(dtMs);
  }

  /** The views shown, by room id. */
  shown(): string[] {
    return this.calls.flatMap((call) => (call.method === 'show' ? [call.view.room] : []));
  }
}
