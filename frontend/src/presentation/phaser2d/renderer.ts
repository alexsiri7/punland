import Phaser from 'phaser';
import { hotspotRect } from '../../assets/registry';
import type { FloorPoint, Rect } from '../../domain';
import type { Pick, Renderer, SceneView, ScenePoint } from '../renderer';
import { palette, SCENE_HEIGHT, SCENE_WIDTH, UI_BAR_HEIGHT } from '../theme';
import { type RoomData, RoomScene } from './RoomScene';

/**
 * The 2D renderer: each room is its layered art, drawn by one Phaser scene that restarts for
 * every view. The 1280 x 640 scene has the 160 px UI bar under it (docs/design/STYLE.md).
 */
export class Phaser2dRenderer implements Renderer {
  private game: Phaser.Game | null = null;
  private scene: RoomScene | null = null;
  private view: SceneView | null = null;
  /** Whether `view` is drawn. */
  private drawn = false;
  private at: FloorPoint = { x: 0, y: 0 };
  /** Views asked for and not drawn yet, oldest first. */
  private showing: { view: SceneView; done: () => void }[] = [];

  mount(container: HTMLElement): Promise<void> {
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: container,
      width: SCENE_WIDTH,
      height: SCENE_HEIGHT + UI_BAR_HEIGHT,
      backgroundColor: palette.uiGround,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [],
      banner: false,
    });
    this.game = game;
    return new Promise((resolve) => game.events.once(Phaser.Core.Events.READY, () => resolve()));
  }

  show(view: SceneView): Promise<void> {
    const game = this.engine();
    this.view = view;
    this.drawn = false;
    this.at = view.player.at;
    const shown = new Promise<void>((done) => this.showing.push({ view, done }));
    const data: RoomData = { view };
    if (this.scene) {
      this.scene.scene.restart(data);
    } else {
      this.scene = new RoomScene((drawn) => this.shown(drawn));
      game.scene.add(RoomScene.KEY, this.scene, true, data);
    }
    return shown;
  }

  setPlayer(at: FloorPoint): void {
    this.at = at;
    if (this.drawn) this.scene?.placePlayer(at);
  }

  setVisible(hotspot: string, visible: boolean): void {
    if (this.drawn) this.scene?.setVisible(hotspot, visible);
  }

  /** The 2D art has no clips: the mirror still shows the player's (app/mirror.ts). */
  play(): void {}

  /** Hotspots are picked by their DOM buttons, which take the pointer in 2D: the canvas is all floor. */
  readonly picksHotspots = false;

  pick(screen: ScenePoint): Pick {
    if (!this.drawn || screen.y >= SCENE_HEIGHT) return { kind: 'none' };
    return { kind: 'floor', at: { x: screen.x, y: screen.y } };
  }

  hotspotBounds(hotspot: string): Rect | null {
    return this.view && hotspotRect(this.view.model, hotspot);
  }

  anchor(who: string, name: 'head' | 'hand_r'): ScenePoint | null {
    if (who !== 'player' || name !== 'head' || !this.drawn || !this.scene) return null;
    return { x: this.at.x, y: this.at.y - this.scene.headroom() };
  }

  canvas(): HTMLCanvasElement {
    return this.engine().canvas;
  }

  onResize(callback: () => void): () => void {
    const { scale } = this.engine();
    scale.on(Phaser.Scale.Events.RESIZE, callback);
    return () => scale.off(Phaser.Scale.Events.RESIZE, callback);
  }

  frame(callback: (dtMs: number) => void): () => void {
    const game = this.engine();
    // Phaser's smoothed delta is capped per frame, so a slow or unfocused page would walk in slow motion.
    const step = () => callback(game.loop.rawDelta);
    game.events.on(Phaser.Core.Events.STEP, step);
    return () => game.events.off(Phaser.Core.Events.STEP, step);
  }

  destroy(): void {
    this.game?.destroy(true);
    this.game = null;
    this.scene = null;
  }

  /** The view is drawn: it and every view asked for before it are done with. */
  private shown(view: SceneView): void {
    const index = this.showing.findIndex((s) => s.view === view);
    for (const { done } of this.showing.splice(0, index + 1)) done();
    if (view !== this.view) return;
    this.drawn = true;
    this.scene?.placePlayer(this.at);
  }

  private engine(): Phaser.Game {
    if (!this.game) throw new Error('the renderer is not mounted');
    return this.game;
  }
}
