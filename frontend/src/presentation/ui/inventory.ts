import type { Session } from '../session';

export interface InventoryBar {
  readonly element: HTMLElement;
}

/**
 * The inventory slots in the UI bar (STYLE.md, UI), as a list of buttons over the canvas so
 * a player with a keyboard or a screen reader can use them too: the items carried, the selected
 * one marked, again whenever they or the selection change. Clicking an item uses it on its own
 * (selects it, when the story gives it no use of its own), or unselects it, or uses the selected
 * item on it; the item under the pointer or focus goes to `on.hover`, null once none is.
 */
export function createInventoryBar(
  doc: Document,
  session: Session,
  on: { hover(id: string | null): void },
): InventoryBar {
  const list = doc.createElement('ul');
  list.className = 'inventory';
  list.setAttribute('role', 'list');
  list.setAttribute('aria-label', 'Inventory');
  const select = (id: string) => {
    const { selected } = session.state;
    if (selected === null) session.dispatch({ type: 'useItem', item: id });
    else if (selected !== id) session.dispatch({ type: 'combine', item: selected, on: id });
    else session.dispatch({ type: 'select', item: null });
    on.hover(id);
  };
  // Removing a focused or hovered button fires blur/pointerleave: stop listening first.
  let listening = new AbortController();
  const render = () => {
    listening.abort();
    listening = new AbortController();
    const { signal } = listening;
    const { selected } = session.state;
    list.replaceChildren(
      ...session.state.inventory.carried.map((id) => {
        const button = doc.createElement('button');
        button.type = 'button';
        button.setAttribute('aria-label', session.content.items[id]?.name ?? id);
        button.setAttribute('aria-pressed', String(id === selected));
        const icon = doc.createElement('img');
        icon.src = `items/${id}.svg`;
        icon.alt = '';
        button.append(icon);
        button.addEventListener('pointerenter', () => on.hover(id), { signal });
        button.addEventListener('focus', () => on.hover(id), { signal });
        button.addEventListener('pointerleave', () => on.hover(null), { signal });
        button.addEventListener('blur', () => on.hover(null), { signal });
        button.addEventListener('click', () => select(id), { signal });
        const slot = doc.createElement('li');
        slot.append(button);
        return slot;
      }),
    );
  };
  render();
  session.subscribe((event) => {
    if (
      event.type === 'pickedUp' ||
      event.type === 'itemAdded' ||
      event.type === 'itemRemoved' ||
      event.type === 'selected'
    ) {
      render();
    }
  });
  return { element: list };
}
