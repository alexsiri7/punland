/**
 * Rooms as content data (progress spec, "Story as content"): one JSON file per room in
 * ./rooms/, named after the room id. Adding a room is adding a file here plus its art in
 * art/<room>/scene.svg, rendered to public/rooms/<room>/; no code change.
 * Positions are scene pixels (1280 x 640).
 */
export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What happens once the player has walked to a hotspot. */
export type HotspotAction =
  | { type: 'say'; line: string }
  /** `at`: where the player stands in the other room; that room's `start` when left out. */
  | { type: 'exit'; room: string; at?: Point };

/** Every action type, typed so it can't drift from HotspotAction; content is checked against it. */
export const ACTION_TYPES: Record<HotspotAction['type'], true> = { say: true, exit: true };

export interface Hotspot {
  id: string;
  /** Accessible name, shown on hover. */
  name: string;
  /** Shown before the name in the UI bar's action line on hover, e.g. "Go in". */
  verb: string;
  rect: Rect;
  /** Where the player walks to before the action happens; inside the walkable area. */
  walkTo: Point;
  action: HotspotAction;
}

export interface Room {
  /** UI bar location label, e.g. "PUNLAND · HIGH STREET". */
  label: string;
  /** UI bar action line when nothing is hovered. */
  place: { verb: string; name: string };
  hint: string;
  /** Where the player stands on arriving, unless the exit says otherwise. */
  start: Point;
  /** The floor, a convex polygon: the player walks in straight lines inside it. */
  walkable: Point[];
  hotspots: Hotspot[];
}

const files = import.meta.glob<Room>('./rooms/*.json', { eager: true, import: 'default' });

export const rooms: Record<string, Room> = Object.fromEntries(
  Object.entries(files).map(([path, room]) => [path.replace(/^.*\/(.+)\.json$/, '$1'), room]),
);

/** Where a new game starts: outside The Three Crows (scenes spec, "Opening scene"). */
export const START_ROOM = 'opening';
