import { hotspotRect } from '../../../src/assets/registry';
import type { FloorPoint, Rect } from '../../../src/domain';
import type { AnimationName, Pick, Renderer, ScenePoint, SceneView } from '../../../src/presentation/renderer';
import { SCENE_HEIGHT, SCENE_WIDTH, UI_BAR_HEIGHT } from '../../../src/presentation/theme';

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
  private element: HTMLCanvasElement | null = null;
  private view: SceneView | null = null;
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
    return this.view && hotspotRect(this.view.model, hotspot);
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
