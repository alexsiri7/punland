import type { World } from '../domain/content';
import content from './worlds.json';

/**
 * Worlds as content data (worlds spec): ./worlds.json lists the street, online and dream
 * worlds in the switcher's order. A room says which world it is in (./rooms.ts).
 */
export type { World } from '../domain/content';

export const worlds: readonly World[] = content.worlds;
