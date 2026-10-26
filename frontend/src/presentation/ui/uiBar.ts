import type { Hotspot, Room } from '../../domain';
import type { Session } from '../session';

export interface UiBar {
  readonly element: HTMLElement;
  /** Shows a room's label and hint, with nothing hovered. */
  show(room: Room): void;
  /** The hotspot under the pointer or focus changed. */
  hover(h: Hotspot | null): void;
  /** An inventory item is under the pointer or focus; null when none is. */
  hoverItem(id: string | null): void;
  /** The selection changed: the action line says so for what is hovered. */
  reselected(): void;
}

/**
 * The UI bar under the scene (STYLE.md, UI bar): the location label, the action line (the
 * verb muted, the name in sign gold) and the hint. The inventory and world switcher sit on it.
 */
export function createUiBar(doc: Document, session: Session, mirror: { hover(name: string): void }): UiBar {
  const bar = doc.createElement('div');
  bar.className = 'ui-bar';
  const label = doc.createElement('p');
  label.className = 'ui-bar-label';
  const action = doc.createElement('p');
  action.className = 'ui-bar-action';
  const verb = doc.createElement('span');
  verb.className = 'ui-bar-verb';
  const name = doc.createElement('span');
  name.className = 'ui-bar-name';
  action.append(verb, name);
  const hint = doc.createElement('p');
  hint.className = 'ui-bar-hint';
  bar.append(label, action, hint);

  let room: Room | null = null;
  let hovered: Hotspot | null = null;
  const setActionLine = (v: string, n: string) => {
    verb.textContent = v;
    name.textContent = n;
  };
  const itemName = (id: string) => session.content.items[id]?.name ?? id;
  const hover = (h: Hotspot | null) => {
    hovered = h;
    mirror.hover(h?.name ?? '');
    const { selected } = session.state;
    if (selected !== null) {
      const item = itemName(selected);
      setActionLine(h ? `Use ${item} on` : 'Use', h ? h.name : item);
    } else if (room) {
      setActionLine(h ? h.verb : room.place.verb, h ? h.name : room.place.name);
    }
  };
  return {
    element: bar,
    show(next) {
      room = next;
      label.textContent = next.label;
      hint.textContent = next.hint;
      hovered = null;
      setActionLine(next.place.verb, next.place.name);
    },
    hover,
    hoverItem(id) {
      if (id === null) hover(null);
      else setActionLine('Use', itemName(id));
    },
    reselected() {
      hover(hovered);
    },
  };
}
