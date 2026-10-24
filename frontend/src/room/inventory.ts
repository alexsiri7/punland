import { items } from '../content/items';
import { SCENE_HEIGHT, SCENE_WIDTH, UI_BAR_HEIGHT } from '../theme';

export interface InventoryBar {
  /** Shows the carried items, with the selected one marked. */
  render(carried: readonly string[], selected: string | null): void;
  /** Lines the bar up with the canvas's UI bar, wherever the scale manager has put it. */
  layout(canvas: HTMLCanvasElement): void;
  destroy(): void;
}

/**
 * The inventory slots in the UI bar (STYLE.md, UI), as a list of buttons over the canvas so
 * a player with a keyboard or a screen reader can use them too.
 */
export function createInventoryBar(
  container: HTMLElement,
  on: { hover(id: string | null): void; select(id: string): void },
): InventoryBar {
  const doc = container.ownerDocument;
  const list = doc.createElement('ul');
  list.className = 'inventory';
  list.setAttribute('role', 'list');
  list.setAttribute('aria-label', 'Inventory');
  container.append(list);
  // Removing a focused or hovered button fires blur/pointerleave: stop listening first.
  let listening = new AbortController();
  return {
    render(carried, selected) {
      listening.abort();
      listening = new AbortController();
      const { signal } = listening;
      list.replaceChildren(
        ...carried.map((id) => {
          const button = doc.createElement('button');
          button.type = 'button';
          button.setAttribute('aria-label', items[id].name);
          button.setAttribute('aria-pressed', String(id === selected));
          const icon = doc.createElement('img');
          icon.src = `items/${id}.svg`;
          icon.alt = '';
          button.append(icon);
          button.addEventListener('pointerenter', () => on.hover(id), { signal });
          button.addEventListener('focus', () => on.hover(id), { signal });
          button.addEventListener('pointerleave', () => on.hover(null), { signal });
          button.addEventListener('blur', () => on.hover(null), { signal });
          button.addEventListener('click', () => on.select(id), { signal });
          const slot = doc.createElement('li');
          slot.append(button);
          return slot;
        }),
      );
    },
    layout(canvas) {
      const s = canvas.clientWidth / SCENE_WIDTH;
      list.style.left = `${canvas.offsetLeft}px`;
      list.style.top = `${canvas.offsetTop + SCENE_HEIGHT * s}px`;
      list.style.width = `${canvas.clientWidth}px`;
      list.style.height = `${UI_BAR_HEIGHT * s}px`;
      list.style.setProperty('--s', String(s));
    },
    destroy() {
      listening.abort();
      list.remove();
    },
  };
}
