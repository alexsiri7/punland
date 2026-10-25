import type { Hotspot } from '../../../content/rooms';
import { SCENE_HEIGHT, SCENE_WIDTH, UI_BAR_HEIGHT } from '../../theme';

export interface HotspotLayer {
  /** Lines the layer up with the canvas, wherever the scale manager has put it. */
  layout(canvas: HTMLCanvasElement): void;
  /** Takes one hotspot's button away, e.g. once its item is picked up. */
  remove(id: string): void;
  destroy(): void;
}

/**
 * A room's hotspots as invisible buttons over the canvas, so a player with a keyboard or a
 * screen reader can use them too. Clicks that miss a hotspot fall through to the canvas.
 */
export function createHotspotLayer(
  container: HTMLElement,
  hotspots: Hotspot[],
  on: { hover(h: Hotspot | null): void; activate(h: Hotspot): void },
): HotspotLayer {
  const layer = container.ownerDocument.createElement('div');
  layer.className = 'hotspots';
  layer.setAttribute('role', 'group');
  layer.setAttribute('aria-label', 'Hotspots');
  const height = SCENE_HEIGHT + UI_BAR_HEIGHT;
  // Removing a focused or hovered button fires blur/pointerleave; the scene is gone by then.
  const listening = new AbortController();
  const { signal } = listening;
  const buttons = new Map<string, HTMLButtonElement>();
  for (const h of hotspots) {
    const button = container.ownerDocument.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', h.name);
    button.style.left = `${(100 * h.rect.x) / SCENE_WIDTH}%`;
    button.style.top = `${(100 * h.rect.y) / height}%`;
    button.style.width = `${(100 * h.rect.width) / SCENE_WIDTH}%`;
    button.style.height = `${(100 * h.rect.height) / height}%`;
    button.addEventListener('pointerenter', () => on.hover(h), { signal });
    button.addEventListener('focus', () => on.hover(h), { signal });
    button.addEventListener('pointerleave', () => on.hover(null), { signal });
    button.addEventListener('blur', () => on.hover(null), { signal });
    button.addEventListener('click', () => on.activate(h), { signal });
    layer.append(button);
    buttons.set(h.id, button);
  }
  container.append(layer);
  return {
    layout(canvas) {
      layer.style.left = `${canvas.offsetLeft}px`;
      layer.style.top = `${canvas.offsetTop}px`;
      layer.style.width = `${canvas.clientWidth}px`;
      layer.style.height = `${canvas.clientHeight}px`;
    },
    remove(id) {
      buttons.get(id)?.remove();
      buttons.delete(id);
    },
    destroy() {
      listening.abort();
      layer.remove();
    },
  };
}
