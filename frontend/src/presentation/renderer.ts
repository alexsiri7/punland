import type { FloorPoint, ModelId, Rect } from '../domain';

/** A point in scene pixels (1280 x 640 for the room, with the UI bar under it). */
export interface ScenePoint {
  x: number;
  y: number;
}

/**
 * What to draw, built by the app from content and state. Models are ids in the model registry
 * (src/assets), which says how each one looks to each renderer.
 */
export interface SceneView {
  room: string;
  /** The room's scene model: its art and its hotspots' hit areas. */
  model: ModelId;
  /** The room's hotspots, with the model of the character or object each one places, if it places one. */
  entities: { hotspot: string; model?: ModelId; visible: boolean }[];
  player: { model: ModelId; at: FloorPoint };
}

/** What is under a point of the canvas. */
export type Pick = { kind: 'hotspot'; hotspot: string } | { kind: 'floor'; at: FloorPoint } | { kind: 'none' };

/** The character clips of the asset contract (docs/ARCHITECTURE.md, section 8). */
export type AnimationName =
  | 'idle'
  | 'walk'
  | 'talk'
  | 'pickup'
  | 'use'
  | 'look'
  | 'bored'
  | 'curious'
  | 'smug'
  | 'panicked';

/**
 * Draws the game (docs/ARCHITECTURE.md, section 5) and decides nothing: the app tells it what to
 * show from the session's state and events, and turns its picks into commands. The DOM UI lines
 * up with its canvas and places its controls and speech from its bounds and anchors.
 */
export interface Renderer {
  /** Creates its canvas inside `container`. */
  mount(container: HTMLElement): Promise<void>;
  /** Loads the view's assets (cached) and draws the room; resolves once it is drawn. */
  show(view: SceneView): Promise<void>;
  setPlayer(at: FloorPoint, facing: 'left' | 'right'): void;
  setVisible(hotspot: string, visible: boolean): void;
  play(who: 'player' | string, clip: AnimationName): void;
  /** `screen` is in scene pixels. Nothing is picked while no room is drawn. */
  pick(screen: ScenePoint): Pick;
  /** In scene pixels, for the DOM hotspot buttons. */
  hotspotBounds(hotspot: string): Rect | null;
  /** In scene pixels: `head` is where speech goes. */
  anchor(who: 'player' | string, name: 'head' | 'hand_r'): ScenePoint | null;
  /** For the DOM overlay to line up with. */
  canvas(): HTMLCanvasElement;
  /** Calls back whenever the canvas is resized or moved; returns the unsubscribe. */
  onResize(callback: () => void): () => void;
  /** Calls back every frame with the real time since the last one; returns the unsubscribe. */
  frame(callback: (dtMs: number) => void): () => void;
  destroy(): void;
}
