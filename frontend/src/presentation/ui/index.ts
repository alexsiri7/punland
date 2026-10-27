import type { Renderer } from '../renderer';
import type { Session } from '../session';
import { createDialoguePanel, type DialogueBackend } from './dialogue';
import { createHotspotLayer, type HotspotLayer } from './hotspots';
import { createInventoryBar } from './inventory';
import { createOverlay } from './overlay';
import { createProgress } from './progress';
import { createSpeech } from './speech';
import { createUiBar } from './uiBar';
import { createWorldSwitcher, type WorldSwitcher } from './worlds';

export type { DialogueBackend } from './dialogue';

export interface Ui {
  /** The renderer has drawn the session's room and takes input there: lay the room's controls over it. */
  shown(): void;
  /** The player clicked the room's floor: nothing is hovered any more. */
  walked(): void;
  /** The pointer is over a hotspot the renderer picked on its canvas, or over none. */
  pointed(hotspot: string | null): void;
}

/**
 * All of the game's text and controls, as DOM over the canvas (docs/ARCHITECTURE.md, section 5):
 * the UI bar, the speech line, the hotspot buttons, the inventory, the world switcher, the career
 * stats, the act's goals and the dialogue panel, which talks to `dialogue`. They show the session's events and send it
 * commands; a new part is created here and appended to the overlay's root. The overlay lines up
 * with the renderer's canvas, and the hotspot buttons and speech go where the renderer draws
 * them. The hotspot under the pointer goes to `mirror`.
 */
export function mountUi(
  container: HTMLElement,
  session: Session,
  renderer: Pick<Renderer, 'picksHotspots' | 'canvas' | 'onResize' | 'hotspotBounds' | 'anchor'>,
  mirror: { hover(name: string): void },
  dialogue: DialogueBackend,
): Ui {
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
  const conversation = createDialoguePanel(doc, dialogue, {
    goalReached: (character) => session.dispatch({ type: 'dialogueResult', character, goalReached: true }),
  });
  const progress = createProgress(doc, session.content);
  let hotspots: HotspotLayer | null = null;
  let switcher: WorldSwitcher | null = null;
  let drawn = false;
  /** The hotspot the pointer is over on the canvas, while the renderer picks hotspots. */
  let pointedAt: string | null = null;
  overlay.root.append(
    progress.goals,
    bar.element,
    progress.stats,
    inventory.element,
    speech.element,
    conversation.element,
  );
  progress.render(session.state);

  const characterName = (character: string) => session.content.characters[character]?.name ?? character;
  const renderInventory = () => inventory.render(session.state.inventory.carried, session.state.selected);
  session.subscribe((event) => {
    switch (event.type) {
      case 'said':
        if (drawn) speech.say(event.line, renderer.anchor('player', 'head') ?? session.state.at);
        break;
      case 'hushed':
        speech.hush();
        break;
      case 'pickedUp':
      case 'itemAdded':
      case 'itemRemoved':
        renderInventory();
        break;
      case 'selected':
        renderInventory();
        bar.reselected();
        break;
      case 'hotspotShown': {
        const shown = session.content.rooms[session.state.room]?.hotspots.find((h) => h.id === event.hotspot);
        if (shown) hotspots?.add(shown);
        break;
      }
      case 'hotspotHidden':
        hotspots?.remove(event.hotspot);
        break;
      case 'conversationStarted':
        conversation.open(event.character, characterName(event.character));
        break;
      case 'moved':
        // Walking away ends the conversation.
        conversation.close();
        break;
      case 'roomChanged':
        // The room is redrawn; until it is shown, its old controls must not take input.
        conversation.close();
        drawn = false;
        pointedAt = null;
        hotspots?.destroy();
        switcher?.destroy();
        hotspots = null;
        switcher = null;
        break;
      case 'statChanged':
      case 'goalReached':
      case 'actStarted':
        progress.render(session.state);
        break;
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
    shown() {
      const current = session.content.rooms[session.state.room];
      if (!current) throw new Error(`room "${session.state.room}" is not in the content`);
      drawn = true;
      overlay.follow(renderer);
      speech.hush();
      bar.show(current);
      hotspots = createHotspotLayer(
        doc,
        current.hotspots.filter((h) => session.isPresent(h)),
        (h) => renderer.hotspotBounds(h.id),
        renderer.picksHotspots,
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
      pointedAt = null;
      bar.hover(null);
    },
    pointed(hotspot) {
      if (!drawn || hotspot === pointedAt) return;
      pointedAt = hotspot;
      const current = session.content.rooms[session.state.room];
      bar.hover(current?.hotspots.find((h) => h.id === hotspot) ?? null);
    },
  };
}
