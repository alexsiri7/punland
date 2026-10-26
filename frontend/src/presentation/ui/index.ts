import type { Session } from '../session';
import { createHotspotLayer, type HotspotLayer } from './hotspots';
import { createInventoryBar } from './inventory';
import { createOverlay, type DrawnRoom } from './overlay';
import { createSpeech } from './speech';
import { createUiBar } from './uiBar';
import { createWorldSwitcher, type WorldSwitcher } from './worlds';

export type { DrawnRoom, ScenePoint } from './overlay';

export interface Ui {
  /** The renderer has drawn the session's room and takes input there: lay the room's controls over it. */
  shown(room: DrawnRoom): void;
  /** The player clicked the room's floor: nothing is hovered any more. */
  walked(): void;
}

/**
 * All of the game's text and controls, as DOM over the canvas (docs/ARCHITECTURE.md, section 5):
 * the UI bar, the speech line, the hotspot buttons, the inventory and the world switcher. They
 * show the session's events and send it commands; a new part (the dialogue panel, #8) is
 * created here and appended to the overlay's root. The hotspot under the pointer goes to `mirror`.
 */
export function mountUi(container: HTMLElement, session: Session, mirror: { hover(name: string): void }): Ui {
  const doc = container.ownerDocument;
  const overlay = createOverlay(container);
  const bar = createUiBar(doc, session, mirror);
  const inventory = createInventoryBar(doc, session.content.items, {
    hover: (id) => bar.hoverItem(id),
    select: (id) => {
      session.dispatch({ type: 'select', item: session.state.selected === id ? null : id });
      bar.hoverItem(id);
    },
  });
  const speech = createSpeech(doc);
  let hotspots: HotspotLayer | null = null;
  let switcher: WorldSwitcher | null = null;
  let drawn: DrawnRoom | null = null;
  overlay.root.append(bar.element, inventory.element, speech.element);

  const renderInventory = () => inventory.render(session.state.inventory.carried, session.state.selected);
  session.subscribe((event) => {
    switch (event.type) {
      case 'said':
        if (drawn) speech.say(event.line, drawn.head());
        break;
      case 'hushed':
        speech.hush();
        break;
      case 'pickedUp':
      case 'itemRemoved':
        renderInventory();
        break;
      case 'selected':
        renderInventory();
        bar.reselected();
        break;
      case 'hotspotHidden':
        hotspots?.remove(event.hotspot);
        break;
      case 'hotspotShown':
      case 'roomChanged':
        // The room is redrawn; until it is shown, its old controls must not take input.
        drawn = null;
        hotspots?.destroy();
        switcher?.destroy();
        hotspots = null;
        switcher = null;
        break;
      case 'moved':
      case 'arrived':
      case 'worldChanged':
      case 'gathered':
      case 'saved':
        break;
      default:
        event satisfies never;
    }
  });

  return {
    shown(room) {
      const current = session.content.rooms[session.state.room];
      if (!current) throw new Error(`room "${session.state.room}" is not in the content`);
      drawn = room;
      overlay.follow(room);
      speech.hush();
      bar.show(current);
      hotspots = createHotspotLayer(
        doc,
        current.hotspots.filter((h) => session.isPresent(h)),
        {
          hover: (h) => bar.hover(h),
          activate: (h) => session.dispatch({ type: 'activate', hotspot: h.id }),
        },
      );
      switcher = createWorldSwitcher(doc, session.content.worlds, current.world, {
        enter: (w) => session.dispatch({ type: 'enterWorld', world: w.id }),
      });
      // In the order a keyboard reaches them: hotspots, then the inventory, then the worlds.
      inventory.element.before(hotspots.element);
      inventory.element.after(switcher.element);
      renderInventory();
    },
    walked() {
      bar.hover(null);
    },
  };
}
