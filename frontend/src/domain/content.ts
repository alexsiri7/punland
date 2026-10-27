import type { FloorPoint, Rect } from './geometry';

/**
 * The game's content as the rules read it (progress spec, "Story as content"): the shapes of
 * the data files in src/content/, which loads them (loadContent()).
 */
export interface Content {
  /** In the world switcher's order. */
  worlds: readonly World[];
  /** By room id. */
  rooms: Readonly<Record<string, Room>>;
  /** By item id. */
  items: Readonly<Record<string, Item>>;
  /** Where a new game starts, and what it carries. */
  start: { room: string; items: readonly string[] };
}

export interface World {
  id: string;
  /** Accessible name, shown on the world switcher. */
  name: string;
  /** The room the player arrives in the first time they enter the world. */
  start: string;
  /** Why the world can't be entered yet; an unlocked world leaves it out. */
  locked?: string;
}

export interface Item {
  /** Accessible name, shown on hover. */
  name: string;
  /** What the cat says on using the item on a hotspot that doesn't accept it. */
  noUse: string;
}

/** What happens once the player has walked to a hotspot. */
export type HotspotAction =
  | { type: 'say'; line: string }
  /** `at`: where the player stands in the other room; that room's `start` when left out. */
  | { type: 'exit'; room: string; at?: FloorPoint }
  /** The item goes into the inventory, and the hotspot is gone for good. */
  | { type: 'pickup'; item: string }
  /** A conversation with `character`, the id of its sheet in the backend. */
  | { type: 'talk'; character: string };

/** Using an item on a hotspot that accepts it: the cat says `say`. */
export interface ItemUse {
  item: string;
  say: string;
  /** An item id taken out of the inventory. */
  removes?: string;
}

export interface Hotspot {
  id: string;
  /** Accessible name, shown on hover. */
  name: string;
  /** Shown before the name in the UI bar's action line on hover, e.g. "Go in". */
  verb: string;
  rect: Rect;
  /** Where the player walks to before the action happens; inside the walkable area. */
  walkTo: FloorPoint;
  action: HotspotAction;
  /** Items this hotspot accepts; using any other item on it gets that item's `noUse` line. */
  uses?: ItemUse[];
  /** Doing this hotspot's action gives the dream this material (worlds spec, "Things cross worlds"). */
  dreamMaterial?: string;
  /** A dream hotspot that is only there once some street hotspot has given its `dreamMaterial`. */
  shownWith?: string;
}

export interface Room {
  /** The world the room is in, a `World` id. */
  world: string;
  /** UI bar location label, e.g. "PUNLAND · HIGH STREET". */
  label: string;
  /** UI bar action line when nothing is hovered. */
  place: { verb: string; name: string };
  hint: string;
  /** Where the player stands on arriving, unless the exit says otherwise. */
  start: FloorPoint;
  /** The floor, a convex polygon: the player walks in straight lines inside it. */
  walkable: FloorPoint[];
  hotspots: Hotspot[];
}
