import type { Content } from '../domain/content';
import { items, START_ITEMS } from './items';
import { rooms, START_ROOM } from './rooms';
import { worlds } from './worlds';

/** Today's worlds, rooms and items as one Content. */
export function loadContent(): Content {
  return { worlds, rooms, items, start: { room: START_ROOM, items: START_ITEMS } };
}
