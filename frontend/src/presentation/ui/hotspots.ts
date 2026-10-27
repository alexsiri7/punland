import type { Hotspot, Rect } from '../../domain';
import { SCENE_HEIGHT, SCENE_WIDTH, UI_BAR_HEIGHT } from '../theme';

export interface HotspotLayer {
  readonly element: HTMLElement;
  /** Takes one hotspot's button away, e.g. once its item is picked up. */
  remove(id: string): void;
  destroy(): void;
}

/**
 * A room's hotspots as invisible buttons over the canvas, at their `bounds` in scene pixels, so
 * a player with a keyboard or a screen reader can use them too. A hotspot without bounds isn't
 * drawn and gets no button. Clicks that miss a hotspot fall through to the canvas.
 */
export function createHotspotLayer(
  doc: Document,
  hotspots: readonly Hotspot[],
  bounds: (h: Hotspot) => Rect | null,
  on: { hover(h: Hotspot | null): void; activate(h: Hotspot): void },
): HotspotLayer {
  const layer = doc.createElement('div');
  layer.className = 'hotspots';
  layer.setAttribute('role', 'group');
  layer.setAttribute('aria-label', 'Hotspots');
  const height = SCENE_HEIGHT + UI_BAR_HEIGHT;
  // Removing a focused or hovered button fires blur/pointerleave; the room is gone by then.
  const listening = new AbortController();
  const { signal } = listening;
  const buttons = new Map<string, HTMLButtonElement>();
  for (const h of hotspots) {
    const rect = bounds(h);
    if (!rect) continue;
    const button = doc.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', h.name);
    button.style.left = `${(100 * rect.x) / SCENE_WIDTH}%`;
    button.style.top = `${(100 * rect.y) / height}%`;
    button.style.width = `${(100 * rect.width) / SCENE_WIDTH}%`;
    button.style.height = `${(100 * rect.height) / height}%`;
    button.addEventListener('pointerenter', () => on.hover(h), { signal });
    button.addEventListener('focus', () => on.hover(h), { signal });
    button.addEventListener('pointerleave', () => on.hover(null), { signal });
    button.addEventListener('blur', () => on.hover(null), { signal });
    button.addEventListener('click', () => on.activate(h), { signal });
    layer.append(button);
    buttons.set(h.id, button);
  }
  return {
    element: layer,
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
