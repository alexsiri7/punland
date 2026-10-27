import type { FloorPoint } from './geometry';

/**
 * Ids of things that are in the content. Only the content validators (src/content/validate.ts)
 * make them, so an id in a `Content` names something that exists. Lookups by id take any
 * string: commands and saves hand ids in unchecked.
 */
export type RoomId = string & { readonly __brand: 'RoomId' };
export type ItemId = string & { readonly __brand: 'ItemId' };
export type WorldId = string & { readonly __brand: 'WorldId' };
export type HotspotId = string & { readonly __brand: 'HotspotId' };
/** A character's id is also the id of its sheet in the backend (backend/src/punland_api/content/characters). */
export type CharacterId = string & { readonly __brand: 'CharacterId' };
export type ObjectId = string & { readonly __brand: 'ObjectId' };
/**
 * A model's id in the model registry (src/assets/models.json), e.g. `character/bartender`: how a
 * room, character or object looks. Unbranded: the content can't see the registry, so the asset
 * validators (src/assets/validate.ts) check that each one is there.
 */
export type ModelId = string;

/**
 * The game's content as the rules read it (progress spec, "Story as content"): the shapes of
 * the data files in src/content/, which checks and loads them (loadContent()).
 */
export interface Content {
  /** In the world switcher's order. */
  worlds: readonly World[];
  /** By room id. */
  rooms: Readonly<Record<string, Room>>;
  /** By item id. */
  items: Readonly<Record<string, Item>>;
  /** By character id. */
  characters: Readonly<Record<string, Character>>;
  /** By object id. */
  objects: Readonly<Record<string, Prop>>;
  /** The protagonist's display data; the name comes from content/protagonist.ts. */
  protagonist: Entity;
  /** Where a new game starts, and what it carries. */
  start: { room: RoomId; items: readonly ItemId[] };
}

export interface World {
  id: WorldId;
  /** Accessible name, shown on the world switcher. */
  name: string;
  /** The room the player arrives in the first time they enter the world. */
  start: RoomId;
  /** Why the world can't be entered yet; an unlocked world leaves it out. */
  locked?: string;
}

/** A reusable thing a room can place (content/characters.json, content/objects.json). */
export interface Entity {
  /** Accessible name. */
  name: string;
  /** E.g. `character/bartender`. */
  model: ModelId;
}

export interface Character extends Entity {
  id: CharacterId;
}

/** A reusable prop, e.g. the flyer. */
export interface Prop extends Entity {
  id: ObjectId;
}

export interface Item {
  /** Accessible name, shown on hover. */
  name: string;
  /** What the cat says on using the item on a hotspot that doesn't accept it. */
  noUse: string;
}

export const VERBS = ['look', 'use', 'talk', 'pickup', 'go'] as const;

/** A verb an interaction answers to; `use` with an `item` is "use X on Y". */
export type Verb = (typeof VERBS)[number];

/** What a hotspot does for one verb: if every condition in `when` holds, its effects run in order. */
export interface Interaction {
  verb: Verb;
  /** The item used on the hotspot; only with the `use` verb. */
  item?: ItemId;
  when?: Condition[];
  effects: Effect[];
}

/** A flag's value in `GameState.flags`. */
export type FlagValue = boolean | number | string;

/** Something about the game that holds or not. Stats, acts and goals (#11) add theirs here. */
export type Condition =
  /** The item is in the inventory. */
  | { has: ItemId }
  /** The item was picked up at some point, even if it has gone since. */
  | { pickedUp: ItemId }
  /** The dream has this material (worlds spec, "Things cross worlds"). */
  | { gathered: string }
  /** The flag is `is`, true when left out. */
  | { flag: string; is?: FlagValue }
  | { not: Condition };

/** One thing an interaction does. Stats and goals (#11) add theirs here. */
export type Effect =
  /** The player says the line. */
  | { say: string }
  /** Into another room of the same world: at `at`, or that room's `start`. */
  | { goTo: RoomId; at?: FloorPoint }
  /** The item goes into the inventory, and counts as picked up for good. */
  | { pickUp: ItemId }
  /** The item goes into the inventory. */
  | { give: ItemId }
  /** The item goes out of the inventory. */
  | { take: ItemId }
  /** The dream gets this material. */
  | { gather: string }
  | { set: string; to: FlagValue }
  /** A conversation with the character: the dialogue panel takes over. */
  | { talk: CharacterId };

/** What a hotspot is in the scene: a placed character or object, or a part of the scene itself. */
export type HotspotTarget =
  /** `at`: the floor point the entity stands on. */
  | { entity: CharacterId | ObjectId; at: FloorPoint }
  /** A part of the scene, such as a door or a board. */
  | { node: string };

export interface Hotspot {
  /** Unique in its room. */
  id: HotspotId;
  /** Accessible name, shown on hover. */
  name: string;
  /** Shown before the name in the UI bar's action line on hover, e.g. "Go in". */
  verb: string;
  target: HotspotTarget;
  /** Where the player walks to before an interaction runs; inside the walkable area. */
  walkTo: FloorPoint;
  /**
   * Activating the hotspot runs its first interaction without an `item` whose conditions hold;
   * with an item selected, the first `use` interaction for that item whose conditions hold, or
   * else the item's `noUse` line.
   */
  interactions: Interaction[];
  /** The hotspot is in its room only while all of these hold; always, when left out. */
  presentWhen?: Condition[];
}

export interface Room {
  /** The world the room is in. */
  world: WorldId;
  /** Its scene model, e.g. `scene/opening`: the room's art and its hotspots' hit areas. */
  model: ModelId;
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
