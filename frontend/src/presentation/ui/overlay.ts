import { SCENE_HEIGHT, SCENE_WIDTH, UI_BAR_HEIGHT } from '../theme';

/** A point in scene pixels (1280 x 640). */
export interface ScenePoint {
  x: number;
  y: number;
}

/** What the renderer tells the UI about the room it has drawn and takes input in. */
export interface DrawnRoom {
  readonly canvas: HTMLCanvasElement;
  /** Just over the player's head, where their speech goes. */
  head(): ScenePoint;
  /** Calls back whenever the canvas is resized or moved; returns the unsubscribe. */
  onResize(callback: () => void): () => void;
}

export interface Overlay {
  /** Where every UI part goes: it covers the canvas and the 160 px UI bar it draws under the scene. */
  readonly root: HTMLElement;
  /** Lines the overlay up with this room's canvas, now and whenever it is resized. */
  follow(room: DrawnRoom): void;
}

/**
 * The UI's root, lined up with the canvas wherever the scale manager puts it. Its --s is
 * the canvas scale, so style.css sizes the UI in scene pixels with calc(<px> * var(--s)).
 * Hidden until there is a canvas to line up with.
 */
export function createOverlay(container: HTMLElement): Overlay {
  const root = container.ownerDocument.createElement('div');
  root.className = 'ui';
  root.hidden = true;
  root.style.setProperty('--scene-height', `${SCENE_HEIGHT}px`);
  root.style.setProperty('--ui-bar-height', `${UI_BAR_HEIGHT}px`);
  container.append(root);
  let unfollow = () => {};
  return {
    root,
    follow(room) {
      const layout = () => {
        const { canvas } = room;
        root.style.left = `${canvas.offsetLeft}px`;
        root.style.top = `${canvas.offsetTop}px`;
        root.style.width = `${canvas.clientWidth}px`;
        root.style.height = `${canvas.clientHeight}px`;
        root.style.setProperty('--s', String(canvas.clientWidth / SCENE_WIDTH));
      };
      unfollow();
      unfollow = room.onResize(layout);
      layout();
      root.hidden = false;
    },
  };
}
