import {
  type Content,
  type FloorPoint,
  type Hotspot,
  type HotspotAction,
  type HotspotId,
  type Item,
  type ItemId,
  type ItemUse,
  insidePolygon,
  isConvex,
  type Rect,
  type Room,
  type RoomId,
  SCENE,
  type World,
  type WorldId,
} from '../domain';

/**
 * Content checked as it loads (architecture spec, "Validated content"): the shapes of
 * worlds.json, items.json and rooms/<room>.json, and that they hold together.
 */

/** A problem in a content file: the file by its path under src/, and the field's JSON path in it. */
export interface ContentIssue {
  file: string;
  /** E.g. `hotspots[2].action.room`; empty for the file as a whole. */
  field: string;
  message: string;
}

/** Content files by their path under src/, e.g. `content/rooms/opening.json`, parsed. Others are ignored. */
export type ContentFiles = Readonly<Record<string, unknown>>;

export type ContentResult = { content: Content; issues: [] } | { content: null; issues: ContentIssue[] };

const WORLDS_FILE = 'content/worlds.json';
const ITEMS_FILE = 'content/items.json';
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
  const itemsById = itemsFile.get('items').value;
  const known: Known = {
    room: new Set(roomFiles.map((room) => room.id)),
    item: new Set(isObject(itemsById) ? Object.keys(itemsById) : []),
    world: new Set(worldsFile.get('worlds').elements.map((world) => world.get('id').value).filter(isString)),
  };

  const worlds = readWorlds(worldsFile, known);
  const { items, start } = readItems(itemsFile, known);
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
  return { content: { worlds, rooms, items, start: { room: startRoom, items: start } }, issues: [] };
}

/** What a field stands for when it is wrong: never part of a returned `Content`. */
const NOWHERE: FloorPoint = { x: 0, y: 0 };

type Known = Record<'room' | 'item' | 'world', ReadonlySet<string>>;

function readWorlds(file: Field, known: Known): World[] {
  const seen = new Set<string>();
  return file.get('worlds').list((world) => {
    const id = world.get('id');
    if (seen.has(id.text())) id.problem('is used by another world');
    seen.add(id.text());
    const locked = world.get('locked').optional((field) => field.text());
    return {
      id: id.text() as WorldId,
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

function readRoom(room: Field, known: Known): Room {
  const world = room.get('world').id('world', known.world);
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
    const id = hotspot.get('id');
    if (seen.has(id.text())) id.problem('is used by another hotspot in this room');
    seen.add(id.text());
    const uses = hotspot.get('uses').optional((field) => field.list((use) => readUse(use, known)));
    const dreamMaterial = hotspot.get('dreamMaterial').optional((field) => field.text());
    const shownWith = hotspot.get('shownWith').optional((field) => field.text());
    return {
      id: id.text() as HotspotId,
      name: hotspot.get('name').text(),
      verb: hotspot.get('verb').text(),
      rect: inScene(hotspot.get('rect')),
      walkTo: onFloor(hotspot.get('walkTo')),
      action: readAction(hotspot.get('action'), known),
      ...(uses !== undefined && { uses }),
      ...(dreamMaterial !== undefined && { dreamMaterial }),
      ...(shownWith !== undefined && { shownWith }),
    };
  });

  return { world, label, place: { verb, name }, hint, start, walkable: floor ?? [], hotspots };
}

function inScene(field: Field): Rect {
  const rect = field.checked((f) => f.rect());
  if (rect && (rect.x < 0 || rect.y < 0 || rect.x + rect.width > SCENE.width || rect.y + rect.height > SCENE.height)) {
    field.problem(`must be inside the ${SCENE.width} × ${SCENE.height} scene`);
  }
  return rect ?? { ...NOWHERE, width: 0, height: 0 };
}

function readAction(action: Field, known: Known): HotspotAction {
  const type = action.get('type');
  switch (type.value) {
    case 'say':
      return { type: 'say', line: action.get('line').text() };
    case 'exit': {
      const at = action.get('at').optional((field) => field.checked((f) => f.point()));
      return { type: 'exit', room: action.get('room').id('room', known.room), ...(at !== undefined && { at }) };
    }
    case 'pickup':
      return { type: 'pickup', item: action.get('item').id('item', known.item) };
    case 'talk':
      return { type: 'talk', character: action.get('character').text() };
    default:
      type.problem(type.present ? 'must be say, exit, pickup or talk' : 'is missing');
      return { type: 'say', line: '' };
  }
}

function readUse(use: Field, known: Known): ItemUse {
  const removes = use.get('removes').optional((field) => field.id('item', known.item));
  return {
    item: use.get('item').id('item', known.item),
    say: use.get('say').text(),
    ...(removes !== undefined && { removes }),
  };
}

/** An exit leads to a room in the same world (worlds are entered from the switcher), onto its floor. */
function checkExits(field: Field, room: Room, rooms: Readonly<Record<string, Room>>, known: Known): void {
  for (const [i, { action }] of room.hotspots.entries()) {
    if (action.type !== 'exit') continue;
    const to = Object.hasOwn(rooms, action.room) ? rooms[action.room] : undefined;
    if (!to) continue;
    const at = field.get('hotspots').get(i).get('action');
    if (known.world.has(room.world) && known.world.has(to.world) && to.world !== room.world) {
      at.get('room').problem('is a room in another world; worlds are entered from the switcher');
    }
    if (action.at && isConvex(to.walkable) && !insidePolygon(action.at, to.walkable)) {
      at.get('at').problem(`is not on the floor of "${action.room}"`);
    }
  }
}

interface Ids {
  room: RoomId;
  item: ItemId;
  world: WorldId;
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

  rect(): Rect {
    if (!this.object()) return { ...NOWHERE, width: 0, height: 0 };
    return {
      x: this.get('x').number(),
      y: this.get('y').number(),
      width: this.get('width').number(),
      height: this.get('height').number(),
    };
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

  /** The id of a room, item or world that is in the content. */
  id<K extends keyof Ids>(kind: K, known: ReadonlySet<string>): Ids[K] {
    const id = this.string();
    if (isString(this.value) && !known.has(id)) this.problem(`"${id}" is not a known ${kind}`);
    return id as Ids[K];
  }

  private object(): boolean {
    if (isObject(this.value)) return true;
    this.wrong('an object');
    return false;
  }

  private wrong(expected: string): void {
    this.problem(this.present ? `must be ${expected}` : 'is missing');
  }
}
