import type { FloorPoint } from './geometry';
import type { Speaker } from './state';

/** Everything the player does (docs/ARCHITECTURE.md, section 4). */
export type Command =
  /** A floor click; the rules clamp it to the floor. */
  | { type: 'walk'; to: FloorPoint }
  /** Walks to the hotspot, then runs its action, or uses the selected item on it. */
  | { type: 'activate'; hotspot: string }
  | { type: 'select'; item: string | null }
  | { type: 'enterWorld'; world: string }
  /** Advances walking; runs what the walk was for on arrival. */
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
  | { type: 'itemRemoved'; item: string }
  | { type: 'selected'; item: string | null }
  | { type: 'roomChanged'; room: string; at: FloorPoint }
  | { type: 'worldChanged'; world: string }
  | { type: 'hotspotShown' | 'hotspotHidden'; hotspot: string }
  | { type: 'gathered'; material: string }
  /** The player talks to a character: the dialogue panel takes over. */
  | { type: 'conversationStarted'; character: string }
  /** State worth persisting changed. */
  | { type: 'saved' };
