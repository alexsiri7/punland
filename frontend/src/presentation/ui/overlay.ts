import type { Renderer } from '../renderer';
import { SCENE_HEIGHT, SCENE_WIDTH, UI_BAR_HEIGHT } from '../theme';

export interface Overlay {
  /** Where every UI part goes: it covers the canvas and the 160 px UI bar it draws under the scene. */
  readonly root: HTMLElement;
  /** Lines the overlay up with the renderer's canvas, now and whenever it is resized. */
  follow(renderer: Pick<Renderer, 'canvas' | 'onResize'>): void;
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
    follow(renderer) {
      const layout = () => {
        const canvas = renderer.canvas();
        root.style.left = `${canvas.offsetLeft}px`;
        root.style.top = `${canvas.offsetTop}px`;
        root.style.width = `${canvas.clientWidth}px`;
        root.style.height = `${canvas.clientHeight}px`;
        root.style.setProperty('--s', String(canvas.clientWidth / SCENE_WIDTH));
      };
      unfollow();
      unfollow = renderer.onResize(layout);
      layout();
      root.hidden = false;
    },
  };
}
