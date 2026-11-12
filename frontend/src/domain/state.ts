import type { Content, Effect, FlagValue } from './content';
import type { FloorPoint } from './geometry';
import type { JourneyState, Place } from './journey';

/** Who says a line: the protagonist, or a character by id. */
export type Speaker = 'player' | string;

/** How long a spoken line stays up, in ms: longer lines for longer. */
export function speechMs(line: string): number {
  return Math.max(3000, 60 * line.length);
}

/**
 * The whole game as plain data (docs/ARCHITECTURE.md, section 3). The rules (src/rules) turn
 * one state into the next. `selected`, `walk`, `saying` and `cue` are transient and never saved.
 */
export interface GameState {
  room: string;
  at: FloorPoint;
  inventory: { carried: string[]; pickedUp: string[] };
  journey: JourneyState;
  flags: Record<string, FlagValue>;
  /** Career stats by stat id. */
  stats: Record<string, number>;
  /** The act being played. */
  act: string;
  /** The reached goals of the current act. */
  goals: string[];
  /** The rooms the player has been in. */
  visited: string[];
  /** Where a `goBack` effect returns to: where the player last left a room by `goTo` or `goBack`. */
  back: Place | null;
  selected: string | null;
  /** Where the player is walking, and what happens on arrival: `hotspot`'s interaction, or using `item` on it. */
  walk: { target: FloorPoint; then: { hotspot: string; item: string | null } | null } | null;
  saying: { line: string; by: Speaker } | null;
  /** A `wait` effect counting down: then the rest of its effects run, as an interaction with `hotspot` if it is set. */
  cue: { ms: number; effects: Effect[]; hotspot: string | null } | null;
}

/** A new game: the start room's start point, carrying the start items, in the first act with the start stats. */
export function newGame(content: Content): GameState {
  const room = content.rooms[content.start.room];
  if (!room) throw new Error(`start room "${content.start.room}" is not in the content`);
  const act = content.acts[0];
  if (!act) throw new Error('the content has no act');
  return {
    room: content.start.room,
    at: { ...room.start },
    inventory: { carried: [...content.start.items], pickedUp: [] },
    journey: { left: {}, gathered: [] },
    flags: {},
    stats: Object.fromEntries(content.stats.map((stat) => [stat.id, stat.start])),
    act: act.id,
    goals: [],
    visited: [content.start.room],
    back: null,
    selected: null,
    walk: null,
    saying: null,
    cue: null,
  };
}
