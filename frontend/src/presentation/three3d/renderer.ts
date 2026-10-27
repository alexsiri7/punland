import { BasicShadowMap, Color, WebGLRenderer } from 'three';
import type { FloorPoint, Rect } from '../../domain';
import type { AnimationName, Pick, Renderer, ScenePoint, SceneView } from '../renderer';
import { palette, SCENE_HEIGHT, SCENE_WIDTH, UI_BAR_HEIGHT } from '../theme';
import { Models } from './models';
import { Room } from './room';

const HEIGHT = SCENE_HEIGHT + UI_BAR_HEIGHT;
const UI_GROUND = new Color(palette.uiGround);

/**
 * The 3D renderer (docs/ARCHITECTURE.md, sections 5 and 7): each view is a Room of glb models
 * from the registry, drawn with Three.js in the 1280 x 640 scene at the top of a canvas sized
 * like the 2D one, the 160 px UI bar's ground under it. The canvas fits its container and is
 * centred in it, with the grain overlay over the scene.
 */
export class Three3dRenderer implements Renderer {
  private gl: WebGLRenderer | null = null;
  private container: HTMLElement | null = null;
  private grain: HTMLElement | null = null;
  private observer: ResizeObserver | null = null;
  private readonly models = new Models();
  private view: SceneView | null = null;
  /** The room of `view`, once it is drawn. */
  private room: Room | null = null;
  private at: FloorPoint = { x: 0, y: 0 };
  /** The player's clip, kept from room to room. */
  private playerClip: AnimationName = 'idle';
  /** The canvas's size in CSS pixels. */
  private size = { width: 0, height: 0 };
  private readonly resized = new Set<() => void>();
  private readonly frames = new Set<(dtMs: number) => void>();
  /** Hover and click hit what is drawn: the hotspot buttons are for the keyboard and screen readers. */
  readonly picksHotspots = true;

  /**
   * Without WebGL the game can't be drawn: #game says so, and the promise never resolves, so
   * nothing goes on to use a canvas that isn't there.
   */
  mount(container: HTMLElement): Promise<void> {
    const document = container.ownerDocument;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2', { antialias: true });
    if (!context) {
      const message = document.createElement('p');
      message.className = 'game-message';
      message.setAttribute('role', 'alert');
      message.textContent = "This browser can't draw the game in 3D: WebGL is turned off or unavailable.";
      container.prepend(message);
      return new Promise(() => {});
    }
    const gl = new WebGLRenderer({ canvas, context });
    gl.setPixelRatio(window.devicePixelRatio);
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = BasicShadowMap;
    gl.autoClear = false;
    canvas.style.display = 'block';
    const grain = document.createElement('div');
    grain.className = 'grain';
    grain.setAttribute('aria-hidden', 'true');
    // Before the DOM UI, which lies over both.
    container.prepend(canvas, grain);
    this.gl = gl;
    this.container = container;
    this.grain = grain;
    this.layout();
    this.observer = new ResizeObserver(() => {
      this.layout();
      for (const callback of this.resized) callback();
    });
    this.observer.observe(container);
    let last: number | undefined;
    gl.setAnimationLoop((time) => {
      const dtMs = last === undefined ? 0 : time - last;
      last = time;
      for (const callback of this.frames) callback(dtMs);
      this.room?.animate(dtMs);
      this.draw();
    });
    return Promise.resolve();
  }

  async show(view: SceneView): Promise<void> {
    this.engine();
    this.view = view;
    this.at = view.player.at;
    this.room = null;
    const room = await Room.build(view, this.models);
    if (view !== this.view) return;
    room.placePlayer(this.at);
    room.play('player', this.playerClip);
    this.room = room;
  }

  setPlayer(at: FloorPoint): void {
    this.at = at;
    this.room?.placePlayer(at);
  }

  setVisible(hotspot: string, visible: boolean): void {
    this.room?.setVisible(hotspot, visible);
  }

  play(who: string, clip: AnimationName): void {
    if (who === 'player') this.playerClip = clip;
    this.room?.play(who, clip);
  }

  /** What is drawn at the point: a hotspot in the room, else the floor. */
  pick(screen: ScenePoint): Pick {
    if (!this.room || screen.y >= SCENE_HEIGHT) return { kind: 'none' };
    const hotspot = this.room.hotspotAt(screen);
    if (hotspot !== null) return { kind: 'hotspot', hotspot };
    if (!this.room.isFloor(screen)) return { kind: 'none' };
    return { kind: 'floor', at: { x: screen.x, y: screen.y } };
  }

  /** The projected bounds of a placed entity's model, or of a part of the scene's `hit_*` node. */
  hotspotBounds(hotspot: string): Rect | null {
    return this.room?.hotspotBounds(hotspot) ?? null;
  }

  anchor(who: string, name: 'head' | 'hand_r'): ScenePoint | null {
    return this.room?.anchor(who, name) ?? null;
  }

  canvas(): HTMLCanvasElement {
    return this.engine().domElement;
  }

  onResize(callback: () => void): () => void {
    this.resized.add(callback);
    return () => this.resized.delete(callback);
  }

  frame(callback: (dtMs: number) => void): () => void {
    this.frames.add(callback);
    return () => this.frames.delete(callback);
  }

  destroy(): void {
    this.observer?.disconnect();
    this.gl?.setAnimationLoop(null);
    this.gl?.dispose();
    this.gl?.domElement.remove();
    this.grain?.remove();
    this.gl = null;
    this.room = null;
  }

  /** Fits the canvas in the container, centred, and lays the grain over its scene. */
  private layout(): void {
    const gl = this.engine();
    const container = this.container;
    if (!container) return;
    const scale = Math.min(container.clientWidth / SCENE_WIDTH, container.clientHeight / HEIGHT);
    const width = Math.floor(SCENE_WIDTH * scale);
    const height = Math.floor(HEIGHT * scale);
    gl.setSize(width, height);
    this.size = { width, height };
    const canvas = gl.domElement;
    canvas.style.marginLeft = `${Math.floor((container.clientWidth - width) / 2)}px`;
    canvas.style.marginTop = `${Math.floor((container.clientHeight - height) / 2)}px`;
    if (!this.grain) return;
    this.grain.style.left = `${canvas.offsetLeft}px`;
    this.grain.style.top = `${canvas.offsetTop}px`;
    this.grain.style.width = `${width}px`;
    this.grain.style.height = `${SCENE_HEIGHT * scale}px`;
  }

  /** Clears the canvas to the UI bar's ground and draws the room in the scene above it, on its sky. */
  private draw(): void {
    const gl = this.engine();
    gl.setScissorTest(false);
    gl.setClearColor(UI_GROUND);
    gl.clear();
    if (!this.room) return;
    const { width, height } = this.size;
    const sceneHeight = (height * SCENE_HEIGHT) / HEIGHT;
    gl.setViewport(0, height - sceneHeight, width, sceneHeight);
    gl.setScissor(0, height - sceneHeight, width, sceneHeight);
    gl.setScissorTest(true);
    gl.setClearColor(this.room.sky);
    gl.clear();
    gl.render(this.room.scene, this.room.camera);
  }

  private engine(): WebGLRenderer {
    if (!this.gl) throw new Error('the renderer is not mounted');
    return this.gl;
  }
}
