import content from './worlds.json';

/**
 * Worlds as content data (worlds spec): ./worlds.json lists the street, online and dream
 * worlds in the switcher's order. A room says which world it is in (./rooms.ts).
 */
export interface World {
  id: string;
  /** Accessible name, shown on the world switcher. */
  name: string;
  /** The room the player arrives in the first time they enter the world. */
  start: string;
  /** Why the world can't be entered yet; an unlocked world leaves it out. */
  locked?: string;
}

export const worlds: readonly World[] = content.worlds;
