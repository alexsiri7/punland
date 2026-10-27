import {
  type CharacterId,
  type Condition,
  type Content,
  type Effect,
  type Entity,
  type FlagValue,
  type FloorPoint,
  type Hotspot,
  type HotspotId,
  type HotspotTarget,
  type Interaction,
  type Item,
  type ItemId,
  insidePolygon,
  isConvex,
  type ObjectId,
  type Room,
  type RoomId,
  VERBS,
  type World,
  type WorldId,
} from '../domain';
import { PROTAGONIST } from './protagonist';

/**
 * Content checked as it loads (architecture spec, "Validated content"): the shapes of
 * worlds.json, items.json, characters.json, objects.json and rooms/<room>.json, and that they
 * hold together.
 */

/** A problem in a content file: the file by its path under src/, and the field's JSON path in it. */
export interface ContentIssue {
  file: string;
  /** E.g. `hotspots[2].interactions[0].effects[0].goTo`; empty for the file as a whole. */
  field: string;
  message: string;
}

/** Content files by their path under src/, e.g. `content/rooms/opening.json`, parsed. Others are ignored. */
export type ContentFiles = Readonly<Record<string, unknown>>;

export type ContentResult = { content: Content; issues: [] } | { content: null; issues: ContentIssue[] };

const WORLDS_FILE = 'content/worlds.json';
const ITEMS_FILE = 'content/items.json';
const CHARACTERS_FILE = 'content/characters.json';
const OBJECTS_FILE = 'content/objects.json';
/** A room's id is its file name. */
const ROOM_FILE = /^content\/rooms\/([^/]+)\.json$/;

export function validateContent(files: ContentFiles): ContentIssue[] {
  return readContent(files).issues;
}

/** The content, when the files hold together; otherwise every problem in them. */
export function readContent(files: ContentFiles): ContentResult {
  const issues: ContentIssue[] = [];
  const file = (path: string) => {
    const field = new Field(issues, path, '', files[path]);
    if (!field.present) field.problem('is missing');
    return field;
  };
  const roomFiles = Object.keys(files).flatMap((path) => {
    const id = ROOM_FILE.exec(path)?.[1];
    return id === undefined ? [] : [{ id: id as RoomId, field: file(path) }];
  });
  const worldsFile = file(WORLDS_FILE);
  const itemsFile = file(ITEMS_FILE);
  const charactersFile = file(CHARACTERS_FILE);
  const objectsFile = file(OBJECTS_FILE);
  const itemsById = itemsFile.get('items').value;
  const ids = (list: Field) => new Set(list.elements.map((entry) => entry.get('id').value).filter(isString));
  const known: Known = {
    room: new Set(roomFiles.map((room) => room.id)),
    item: new Set(isObject(itemsById) ? Object.keys(itemsById) : []),
    world: ids(worldsFile.get('worlds')),
    character: ids(charactersFile.get('characters')),
    object: ids(objectsFile.get('objects')),
  };

  const worlds = readWorlds(worldsFile, known);
  const { items, start } = readItems(itemsFile, known);
  const characters = readEntities(charactersFile.get('characters'), 'character');
  const protagonist = { name: PROTAGONIST.name, model: charactersFile.get('protagonist').get('model').text() };
  const objects = readEntities(objectsFile.get('objects'), 'object');
  const read = roomFiles.map(({ id, field }) => ({ id, field, room: readRoom(field, known) }));
  const rooms: Record<string, Room> = Object.fromEntries(read.map(({ id, room }) => [id, room]));
  for (const { field, room } of read) checkExits(field, room, rooms, known);
  for (const [i, world] of worlds.entries()) {
    const room = Object.hasOwn(rooms, world.start) ? rooms[world.start] : undefined;
    if (room && known.world.has(room.world) && room.world !== world.id) {
      worldsFile.get('worlds').get(i).get('start').problem('is a room in another world');
    }
  }
  // A new game starts where the first world does.
  const startRoom = worlds[0]?.start;
  if (startRoom === undefined && worldsFile.present) worldsFile.get('worlds').problem('must list at least one world');

  if (issues.length > 0 || startRoom === undefined) return { content: null, issues };
  return {
    content: { worlds, rooms, items, characters, objects, protagonist, start: { room: startRoom, items: start } },
    issues: [],
  };
}

/** What a field stands for when it is wrong: never part of a returned `Content`. */
const NOWHERE: FloorPoint = { x: 0, y: 0 };

type Known = Record<keyof Ids, ReadonlySet<string>>;

function readWorlds(file: Field, known: Known): World[] {
  const seen = new Set<string>();
  return file.get('worlds').list((world) => {
    const idField = world.get('id');
    const id = idField.text();
    if (seen.has(id)) idField.problem('is used by another world');
    seen.add(id);
    const locked = world.get('locked').optional((field) => field.text());
    return {
      id: id as WorldId,
      name: world.get('name').text(),
      start: world.get('start').id('room', known.room),
      ...(locked !== undefined && { locked }),
    };
  });
}

function readItems(file: Field, known: Known): { items: Record<string, Item>; start: ItemId[] } {
  return {
    items: file.get('items').record((item) => ({ name: item.get('name').text(), noUse: item.get('noUse').text() })),
    start: file.get('start').list((item) => item.id('item', known.item)),
  };
}

/** A list of characters or objects, by id. */
function readEntities<K extends 'character' | 'object'>(list: Field, kind: K): Record<string, Entity & { id: Ids[K] }> {
  const seen = new Set<string>();
  const entries = list.list((entry) => {
    const idField = entry.get('id');
    const id = idField.text();
    if (seen.has(id)) idField.problem(`is used by another ${kind}`);
    seen.add(id);
    return [id, { id: id as Ids[K], name: entry.get('name').text(), model: entry.get('model').text() }] as const;
  });
  return Object.fromEntries(entries);
}

function readRoom(room: Field, known: Known): Room {
  const world = room.get('world').id('world', known.world);
  const model = room.get('model').text();
  const label = room.get('label').text();
  const place = room.get('place');
  const verb = place.get('verb').text();
  const name = place.get('name').text();
  const hint = room.get('hint').string();
  const floor = room.get('walkable').checked((field) => field.list((point) => point.point()));
  if (floor && !isConvex(floor)) room.get('walkable').problem('must be a convex polygon of at least 3 points');
  const walkable = floor && isConvex(floor) ? floor : undefined;
  const onFloor = (field: Field): FloorPoint => {
    const point = field.checked((f) => f.point());
    if (point && walkable && !insidePolygon(point, walkable)) field.problem("is not on the room's floor");
    return point ?? NOWHERE;
  };
  const start = onFloor(room.get('start'));

  const seen = new Set<string>();
  const hotspots = room.get('hotspots').list((hotspot): Hotspot => {
    const idField = hotspot.get('id');
    const id = idField.text();
    if (seen.has(id)) idField.problem('is used by another hotspot in this room');
    seen.add(id);
    const presentWhen = hotspot.get('presentWhen').optional((field) => conditions(field, known));
    return {
      id: id as HotspotId,
      name: hotspot.get('name').text(),
      verb: hotspot.get('verb').text(),
      target: readTarget(hotspot.get('target'), known, onFloor),
      walkTo: onFloor(hotspot.get('walkTo')),
      interactions: hotspot.get('interactions').list((interaction) => readInteraction(interaction, known)),
      ...(presentWhen !== undefined && { presentWhen }),
    };
  });

  return { world, model, label, place: { verb, name }, hint, start, walkable: floor ?? [], hotspots };
}

const TARGETS = kindsOf<HotspotTarget>()(['entity', 'node']);

function readTarget(target: Field, known: Known, onFloor: (field: Field) => FloorPoint): HotspotTarget {
  const kind = kindOf(target, TARGETS);
  if (kind !== 'entity') return { node: kind === 'node' ? target.get('node').text() : '' };
  const entity = target.get('entity');
  const id = entity.text();
  if (isString(entity.value) && !known.character.has(id) && !known.object.has(id)) {
    entity.problem(`"${id}" is not a known character or object`);
  }
  return { entity: id as CharacterId | ObjectId, at: onFloor(target.get('at')) };
}

function readInteraction(interaction: Field, known: Known): Interaction {
  const verbField = interaction.get('verb');
  const verb = VERBS.find((v) => v === verbField.value);
  if (!verb) verbField.problem(verbField.present ? `must be ${VERBS.join(', ')}` : 'is missing');
  const item = interaction.get('item').optional((field) => field.id('item', known.item));
  if (item !== undefined && verb !== 'use') interaction.get('item').problem('goes only with the use verb');
  if (item === undefined && verb === 'use') interaction.get('item').problem('is missing');
  const when = interaction.get('when').optional((field) => conditions(field, known));
  return {
    verb: verb ?? 'look',
    ...(item !== undefined && { item }),
    ...(when !== undefined && { when }),
    effects: interaction.get('effects').list((effect) => readEffect(effect, known)),
  };
}

/** Every key of every member of the union `U`. */
type KeyOf<U> = U extends unknown ? keyof U : never;
/** The members of the union `U` with none of the keys `K`. */
type Unnamed<U, K> = U extends unknown ? (Extract<keyof U, K> extends never ? U : never) : never;

/**
 * `kinds`, the keys that tell the members of the union `U` apart in content JSON, checked against
 * it: while a member has none of them, the call fails to compile and names that member.
 */
function kindsOf<U>() {
  return <const K extends KeyOf<U>>(
    kinds: readonly K[],
    ..._: [Unnamed<U, K>] extends [never] ? [] : [missing: Unnamed<U, K>]
  ): readonly K[] => kinds;
}

/** The one key from `kinds` that says what a target, condition or effect is. */
function kindOf<K extends string>(field: Field, kinds: readonly K[]): K | undefined {
  const { value } = field;
  if (!field.object() || !isObject(value)) return undefined;
  const found = kinds.filter((kind) => Object.hasOwn(value, kind));
  if (found.length === 1) return found[0];
  field.problem(`must have exactly one of ${kinds.join(', ')}`);
  return undefined;
}

function conditions(list: Field, known: Known): Condition[] {
  return list.list((condition) => readCondition(condition, known));
}

const CONDITIONS = kindsOf<Condition>()(['has', 'pickedUp', 'gathered', 'flag', 'not']);

function readCondition(condition: Field, known: Known): Condition {
  switch (kindOf(condition, CONDITIONS)) {
    case 'has':
      return { has: condition.get('has').id('item', known.item) };
    case 'pickedUp':
      return { pickedUp: condition.get('pickedUp').id('item', known.item) };
    case 'gathered':
      return { gathered: condition.get('gathered').text() };
    case 'flag': {
      const is = condition.get('is').optional((field) => field.flagValue());
      return { flag: condition.get('flag').text(), ...(is !== undefined && { is }) };
    }
    case 'not':
      return { not: readCondition(condition.get('not'), known) };
    case undefined:
      return { flag: '' };
  }
}

const EFFECTS = kindsOf<Effect>()(['say', 'goTo', 'pickUp', 'give', 'take', 'gather', 'set', 'talk']);

function readEffect(effect: Field, known: Known): Effect {
  switch (kindOf(effect, EFFECTS)) {
    case 'say':
      return { say: effect.get('say').text() };
    case 'goTo': {
      const at = effect.get('at').optional((field) => field.checked((f) => f.point()));
      return { goTo: effect.get('goTo').id('room', known.room), ...(at !== undefined && { at }) };
    }
    case 'pickUp':
      return { pickUp: effect.get('pickUp').id('item', known.item) };
    case 'give':
      return { give: effect.get('give').id('item', known.item) };
    case 'take':
      return { take: effect.get('take').id('item', known.item) };
    case 'gather':
      return { gather: effect.get('gather').text() };
    case 'set':
      return { set: effect.get('set').text(), to: effect.get('to').flagValue() };
    case 'talk':
      return { talk: effect.get('talk').id('character', known.character) };
    case undefined:
      return { say: '' };
  }
}

/** A `goTo` leads to a room in the same world (worlds are entered from the switcher), onto its floor. */
function checkExits(field: Field, room: Room, rooms: Readonly<Record<string, Room>>, known: Known): void {
  for (const [i, { interactions }] of room.hotspots.entries()) {
    for (const [j, { effects }] of interactions.entries()) {
      for (const [k, effect] of effects.entries()) {
        if (!('goTo' in effect)) continue;
        const to = Object.hasOwn(rooms, effect.goTo) ? rooms[effect.goTo] : undefined;
        if (!to) continue;
        const at = field.get('hotspots').get(i).get('interactions').get(j).get('effects').get(k);
        if (known.world.has(room.world) && known.world.has(to.world) && to.world !== room.world) {
          at.get('goTo').problem('is a room in another world; worlds are entered from the switcher');
        }
        if (effect.at && isConvex(to.walkable) && !insidePolygon(effect.at, to.walkable)) {
          at.get('at').problem(`is not on the floor of "${effect.goTo}"`);
        }
      }
    }
  }
}

interface Ids {
  room: RoomId;
  item: ItemId;
  world: WorldId;
  character: CharacterId;
  object: ObjectId;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const arrayAt = (value: unknown, i: number): unknown => (Array.isArray(value) ? value[i] : undefined);
const propertyOf = (value: unknown, key: string): unknown =>
  isObject(value) && Object.hasOwn(value, key) ? value[key] : undefined;

/**
 * A value in a content file and where it is. Each read reports what is wrong with the value
 * and returns a stand-in for it, so one pass finds every problem; content with any problem is
 * never returned.
 */
class Field {
  constructor(
    private readonly issues: ContentIssue[],
    readonly file: string,
    readonly path: string,
    readonly value: unknown,
  ) {}

  get present(): boolean {
    return this.value !== undefined;
  }

  get(key: string | number): Field {
    const value = typeof key === 'number' ? arrayAt(this.value, key) : propertyOf(this.value, key);
    const path = typeof key === 'number' ? `${this.path}[${key}]` : this.path ? `${this.path}.${key}` : key;
    return new Field(this.issues, this.file, path, value);
  }

  /** The elements, when the value is an array. */
  get elements(): Field[] {
    return Array.isArray(this.value) ? this.value.map((_, i) => this.get(i)) : [];
  }

  problem(message: string): void {
    this.issues.push({ file: this.file, field: this.path, message });
  }

  /** `read`'s result, or undefined when it found a problem. */
  checked<T>(read: (field: Field) => T): T | undefined {
    const before = this.issues.length;
    const value = read(this);
    return this.issues.length === before ? value : undefined;
  }

  /** `read`'s result, or undefined when the field is left out. */
  optional<T>(read: (field: Field) => T): T | undefined {
    return this.present ? read(this) : undefined;
  }

  string(): string {
    if (isString(this.value)) return this.value;
    this.wrong('a string');
    return '';
  }

  /** A string with something in it. */
  text(): string {
    const text = this.string();
    if (isString(this.value) && !/\S/.test(text)) this.problem('is empty');
    return text;
  }

  number(): number {
    if (typeof this.value === 'number' && Number.isFinite(this.value)) return this.value;
    this.wrong('a number');
    return 0;
  }

  point(): FloorPoint {
    if (!this.object()) return NOWHERE;
    return { x: this.get('x').number(), y: this.get('y').number() };
  }

  list<T>(read: (field: Field) => T): T[] {
    if (!Array.isArray(this.value)) {
      this.wrong('a list');
      return [];
    }
    return this.elements.map(read);
  }

  /** An object by id, e.g. items by item id. */
  record<T>(read: (field: Field) => T): Record<string, T> {
    if (!this.object() || !isObject(this.value)) return {};
    return Object.fromEntries(Object.keys(this.value).map((key) => [key, read(this.get(key))]));
  }

  /** The id of a room, item, world, character or object that is in the content. */
  id<K extends keyof Ids>(kind: K, known: ReadonlySet<string>): Ids[K] {
    const id = this.string();
    if (isString(this.value) && !known.has(id)) this.problem(`"${id}" is not a known ${kind}`);
    return id as Ids[K];
  }

  flagValue(): FlagValue {
    const { value } = this;
    if (typeof value === 'boolean' || typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    this.wrong('true, false, a number or a string');
    return false;
  }

  object(): boolean {
    if (isObject(this.value)) return true;
    this.wrong('an object');
    return false;
  }

  private wrong(expected: string): void {
    this.problem(this.present ? `must be ${expected}` : 'is missing');
  }
}
