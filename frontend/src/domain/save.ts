import type { Content, FlagValue } from './content';
import type { FloorPoint } from './geometry';
import type { InventoryState } from './inventory';
import type { JourneyState } from './journey';
import { newGame, type GameState } from './state';

/** Everything needed to resume a game. Stays `version: 1` and only grows by optional fields, so old saves load. */
export interface SaveGame {
  version: 1;
  /** Room id the player was in, from the content data. */
  room: string;
  /** Where the player stood; absent in saves from before #28: the room's start. */
  at?: FloorPoint;
  /** ISO timestamp of the save. */
  savedAt: string;
  /** Absent in saves from before #10: the starting inventory. */
  inventory?: InventoryState;
  /** Absent in saves from before #10: a fresh journey. */
  journey?: JourneyState;
  /** Puzzle state set by `set` effects; absent in saves from before #33: none set. */
  flags?: Record<string, FlagValue>;
  /** The act being played; absent in saves from before #11: the first act. */
  act?: string;
  /** The reached goals of `act`; absent in saves from before #11: none. */
  goals?: string[];
  /** Career stats by stat id; absent in saves from before #11: each stat's start. */
  stats?: Record<string, number>;
}

/** A save without its timestamp, which the rules can't read: whoever writes the save stamps it. */
export type UnstampedSave = Omit<SaveGame, 'savedAt'>;

export function toSave(state: GameState): UnstampedSave {
  return {
    version: 1,
    room: state.room,
    at: { ...state.at },
    inventory: { items: [...state.inventory.carried], pickedUp: [...state.inventory.pickedUp] },
    journey: structuredClone(state.journey),
    flags: { ...state.flags },
    act: state.act,
    goals: [...state.goals],
    stats: { ...state.stats },
  };
}

/**
 * The game a save resumes. A save can name items, rooms, acts, goals and stats the content no
 * longer has (content changed since): they are dropped, an unknown room resumes at the start of
 * a new game, and an unknown act at the first act. A stat the save lacks starts at its start.
 */
export function fromSave(save: UnstampedSave, content: Content): GameState {
  const game = newGame(content);
  const room = Object.hasOwn(content.rooms, save.room) ? content.rooms[save.room] : undefined;
  const at = room ? (save.at ?? room.start) : game.at;
  const act = content.acts.find((a) => a.id === save.act);
  const saved = (stat: string) => (save.stats && Object.hasOwn(save.stats, stat) ? save.stats[stat] : undefined);
  return {
    ...game,
    room: room ? save.room : game.room,
    at: { ...at },
    inventory: save.inventory
      ? {
          carried: save.inventory.items.filter((id) => Object.hasOwn(content.items, id)),
          pickedUp: [...save.inventory.pickedUp],
        }
      : game.inventory,
    journey: save.journey
      ? {
          left: structuredClone(
            Object.fromEntries(
              Object.entries(save.journey.left).filter(([, place]) => Object.hasOwn(content.rooms, place.room)),
            ),
          ),
          gathered: [...save.journey.gathered],
        }
      : game.journey,
    flags: { ...save.flags },
    stats: Object.fromEntries(content.stats.map(({ id, start }) => [id, saved(id) ?? start])),
    act: act ? act.id : game.act,
    goals: act ? (save.goals ?? []).filter((goal) => act.goals.some((g) => g.id === goal)) : game.goals,
  };
}
