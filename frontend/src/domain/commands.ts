import type { FloorPoint } from './geometry';
import type { Speaker } from './state';

/** Everything the player does (docs/ARCHITECTURE.md, section 4). */
export type Command =
  /** A floor click; the rules clamp it to the floor. */
  | { type: 'walk'; to: FloorPoint }
  /** Walks to the hotspot, then runs its interaction, or uses the selected item on it. */
  | { type: 'activate'; hotspot: string }
  | { type: 'select'; item: string | null }
  /** The selected `item` used on another carried item, `on`; with no use for the two, `on` is selected instead. */
  | { type: 'combine'; item: string; on: string }
  /** A carried item used on its own: its `onUse`, or with none that holds, it is selected. */
  | { type: 'useItem'; item: string }
  | { type: 'enterWorld'; world: string }
  /** Once the room is first shown in a play: the room's `onStart` cutscene, if one holds. */
  | { type: 'begin' }
  /** Advances walking and a `wait`: runs what the walk was for on arrival, and what the wait held back once it is over. */
  | { type: 'tick'; dtMs: number }
  /** From the dialogue panel, when a reply reaches the conversation's goal. */
  | { type: 'dialogueResult'; character: string; goalReached: boolean };

/** What changed, for the renderer, the UI and autosave. */
export type GameEvent =
  | { type: 'moved'; at: FloorPoint }
  | { type: 'arrived' }
  | { type: 'said'; line: string; by: Speaker }
  | { type: 'hushed' }
  | { type: 'pickedUp'; item: string; hotspot: string }
  /** The selected item was used on the hotspot: one of its `use` interactions took it. */
  | { type: 'used'; item: string; hotspot: string }
  /** Into the inventory without being picked up, e.g. a character gives it. */
  | { type: 'itemAdded'; item: string }
  | { type: 'itemRemoved'; item: string }
  | { type: 'selected'; item: string | null }
  | { type: 'roomChanged'; room: string; at: FloorPoint }
  | { type: 'worldChanged'; world: string }
  /** The world's unlock conditions came to hold: it can be entered now. */
  | { type: 'worldUnlocked'; world: string }
  | { type: 'hotspotShown' | 'hotspotHidden'; hotspot: string }
  | { type: 'gathered'; material: string }
  /** The player talks to a character: the dialogue panel takes over. */
  | { type: 'conversationStarted'; character: string }
  | { type: 'statChanged'; stat: string; value: number }
  | { type: 'goalReached'; goal: string }
  /** The current act ended and this one started, with none of its goals reached. */
  | { type: 'actStarted'; act: string }
  /** State worth persisting changed. */
  | { type: 'saved' };
