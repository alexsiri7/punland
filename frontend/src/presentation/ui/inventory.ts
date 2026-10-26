import type { Item } from '../../domain';

export interface InventoryBar {
  readonly element: HTMLElement;
  /** Shows the carried items, with the selected one marked. */
  render(carried: readonly string[], selected: string | null): void;
}

/**
 * The inventory slots in the UI bar (STYLE.md, UI), as a list of buttons over the canvas so
 * a player with a keyboard or a screen reader can use them too.
 */
export function createInventoryBar(
  doc: Document,
  items: Readonly<Record<string, Item>>,
  on: { hover(id: string | null): void; select(id: string): void },
): InventoryBar {
  const list = doc.createElement('ul');
  list.className = 'inventory';
  list.setAttribute('role', 'list');
  list.setAttribute('aria-label', 'Inventory');
  // Removing a focused or hovered button fires blur/pointerleave: stop listening first.
  let listening = new AbortController();
  return {
    element: list,
    render(carried, selected) {
      listening.abort();
      listening = new AbortController();
      const { signal } = listening;
      list.replaceChildren(
        ...carried.map((id) => {
          const button = doc.createElement('button');
          button.type = 'button';
          button.setAttribute('aria-label', items[id]?.name ?? id);
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
  };
}
