import type { HotspotAction, Room } from '../domain/content';

/**
 * Rooms as content data (progress spec, "Story as content"): one JSON file per room in
 * ./rooms/, named after the room id. Adding a room is adding a file here plus its art in
 * art/<room>/scene.svg, rendered to public/rooms/<room>/; no code change.
 * Positions are scene pixels (1280 x 640).
 * A hotspot that comes and goes (a pickup, or dream material) is drawn as the art actor with
 * the hotspot's id, so the room shows it only while the hotspot is there.
 */
export type { Hotspot, HotspotAction, ItemUse, Room } from '../domain/content';

/** Every action type, typed so it can't drift from HotspotAction; content is checked against it. */
export const ACTION_TYPES: Record<HotspotAction['type'], true> = { say: true, exit: true, pickup: true };

const files = import.meta.glob<Room>('./rooms/*.json', { eager: true, import: 'default' });

export const rooms: Record<string, Room> = Object.fromEntries(
  Object.entries(files).map(([path, room]) => [path.replace(/^.*\/(.+)\.json$/, '$1'), room]),
);

/** Where a new game starts: outside The Three Crows (scenes spec, "Opening scene"). */
export const START_ROOM = 'opening';
