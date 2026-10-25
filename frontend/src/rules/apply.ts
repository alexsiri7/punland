import {
  type Content,
  type FloorPoint,
  type GameState,
  type Hotspot,
  nearestWalkable,
  type Place,
  type Room,
} from '../domain';
import type { Command, GameEvent } from './commands';

/** Floor px per second. */
export const WALK_SPEED = 320;

/**
 * The rules: the state after `command`, and the events that say what changed. Pure: the inputs
 * are never mutated, and the same inputs give equal outputs. A command that doesn't apply (a
 * hotspot that isn't there, a locked world) leaves the state as it is, with no events.
 */
export function apply(
  content: Content,
  state: GameState,
  command: Command,
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const next = step(content, state, command, events);
  return { state: next, events };
}

/** Whether the hotspot is in its room: not picked up yet, and its dream material gathered. */
export function isPresent(state: GameState, hotspot: Hotspot): boolean {
  if (hotspot.action.type === 'pickup' && state.inventory.pickedUp.includes(hotspot.action.item)) return false;
  return hotspot.shownWith === undefined || state.journey.gathered.includes(hotspot.shownWith);
}

function step(content: Content, state: GameState, command: Command, events: GameEvent[]): GameState {
  switch (command.type) {
    case 'walk': {
      const target = nearestWalkable(command.to, roomOf(content, state.room).walkable);
      return walkTo(select(state, null, events), target, null, events);
    }
    case 'activate': {
      const hotspot = presentHotspot(content, state, command.hotspot);
      if (!hotspot) return state;
      const item = state.selected;
      return walkTo(select(state, null, events), hotspot.walkTo, { hotspot: hotspot.id, item }, events);
    }
    case 'select':
      return select(state, command.item, events);
    case 'enterWorld':
      return enterWorld(content, state, command.world, events);
    case 'tick':
      return tick(content, state, command.dtMs, events);
    default:
      return command satisfies never;
  }
}

function tick(content: Content, state: GameState, dtMs: number, events: GameEvent[]): GameState {
  const { walk } = state;
  if (!walk) return state;
  const dx = walk.target.x - state.at.x;
  const dy = walk.target.y - state.at.y;
  const left = Math.hypot(dx, dy);
  const step = (WALK_SPEED * dtMs) / 1000;
  if (left > step) {
    const at = { x: state.at.x + (dx * step) / left, y: state.at.y + (dy * step) / left };
    events.push({ type: 'moved', at });
    return { ...state, at };
  }
  const at = { ...walk.target };
  events.push({ type: 'moved', at }, { type: 'arrived' });
  const arrived = { ...state, at, walk: null };
  if (!walk.then) return arrived;
  const hotspot = presentHotspot(content, arrived, walk.then.hotspot);
  if (!hotspot) return arrived;
  return walk.then.item === null
    ? runAction(content, arrived, hotspot, events)
    : useItem(content, arrived, walk.then.item, hotspot, events);
}

/** A hotspot's action, once the player has walked to it. */
function runAction(content: Content, state: GameState, hotspot: Hotspot, events: GameEvent[]): GameState {
  let next = hotspot.dreamMaterial ? gather(content, state, hotspot.dreamMaterial, events) : state;
  const { action } = hotspot;
  switch (action.type) {
    case 'say':
      next = say(next, action.line, events);
      break;
    case 'exit':
      next = arrive(content, next, action.at ? { room: action.room, at: action.at } : { room: action.room }, events);
      break;
    case 'pickup':
      next = pickUp(next, action.item, hotspot, events);
      break;
    default:
      action satisfies never;
  }
  events.push({ type: 'saved' });
  return next;
}

/** Use X on Y: the hotspot's response if it accepts the item, else the item's refusal. */
function useItem(content: Content, state: GameState, item: string, hotspot: Hotspot, events: GameEvent[]): GameState {
  const use = hotspot.uses?.find((u) => u.item === item);
  if (!use) {
    const noUse = content.items[item]?.noUse;
    return noUse === undefined ? state : say(state, noUse, events);
  }
  let next = say(state, use.say, events);
  if (use.removes !== undefined && next.inventory.carried.includes(use.removes)) {
    const removed = use.removes;
    const carried = next.inventory.carried.filter((id) => id !== removed);
    next = { ...next, inventory: { ...next.inventory, carried } };
    events.push({ type: 'itemRemoved', item: removed });
  }
  events.push({ type: 'saved' });
  return next;
}

/** The player leaves this world where they stand, and comes back to the same spot; its start the first time. */
function enterWorld(content: Content, state: GameState, id: string, events: GameEvent[]): GameState {
  const world = content.worlds.find((w) => w.id === id);
  const current = roomOf(content, state.room).world;
  if (!world || world.locked !== undefined || world.id === current) return state;
  const left = { ...state.journey.left, [current]: { room: state.room, at: { ...state.at } } };
  const place = left[world.id] ?? { room: world.start };
  const next = arrive(content, { ...state, journey: { ...state.journey, left } }, place, events);
  events.push({ type: 'saved' });
  return next;
}

/** Into another room: at `place.at`, or the room's start. Walking, the selection and speech end. */
function arrive(content: Content, state: GameState, place: Place, events: GameEvent[]): GameState {
  const room = roomOf(content, place.room);
  const at = { ...(place.at ?? room.start) };
  const from = roomOf(content, state.room).world;
  const next = hush(select(state, null, events), events);
  events.push({ type: 'roomChanged', room: place.room, at });
  if (room.world !== from) events.push({ type: 'worldChanged', world: room.world });
  return { ...next, room: place.room, at, walk: null };
}

/** The item goes into the inventory, and the hotspot is gone for good. */
function pickUp(state: GameState, item: string, hotspot: Hotspot, events: GameEvent[]): GameState {
  const { carried, pickedUp } = state.inventory;
  events.push({ type: 'pickedUp', item, hotspot: hotspot.id }, { type: 'hotspotHidden', hotspot: hotspot.id });
  return {
    ...state,
    inventory: {
      carried: carried.includes(item) ? carried : [...carried, item],
      pickedUp: pickedUp.includes(item) ? pickedUp : [...pickedUp, item],
    },
  };
}

/** Dream material: the room's hotspots shown with it appear. */
function gather(content: Content, state: GameState, material: string, events: GameEvent[]): GameState {
  if (state.journey.gathered.includes(material)) return state;
  const next = { ...state, journey: { ...state.journey, gathered: [...state.journey.gathered, material] } };
  events.push({ type: 'gathered', material });
  for (const hotspot of roomOf(content, state.room).hotspots) {
    if (hotspot.shownWith === material && isPresent(next, hotspot)) {
      events.push({ type: 'hotspotShown', hotspot: hotspot.id });
    }
  }
  return next;
}

function walkTo(
  state: GameState,
  target: FloorPoint,
  then: NonNullable<GameState['walk']>['then'],
  events: GameEvent[],
): GameState {
  return { ...hush(state, events), walk: { target: { ...target }, then } };
}

function select(state: GameState, item: string | null, events: GameEvent[]): GameState {
  if (state.selected === item) return state;
  events.push({ type: 'selected', item });
  return { ...state, selected: item };
}

function say(state: GameState, line: string, events: GameEvent[]): GameState {
  events.push({ type: 'said', line, by: 'player' });
  return { ...state, saying: { line, by: 'player' } };
}

function hush(state: GameState, events: GameEvent[]): GameState {
  if (state.saying === null) return state;
  events.push({ type: 'hushed' });
  return { ...state, saying: null };
}

function presentHotspot(content: Content, state: GameState, id: string): Hotspot | undefined {
  const hotspot = roomOf(content, state.room).hotspots.find((h) => h.id === id);
  return hotspot && isPresent(state, hotspot) ? hotspot : undefined;
}

function roomOf(content: Content, id: string): Room {
  const room = content.rooms[id];
  if (!room) throw new Error(`room "${id}" is not in the content`);
  return room;
}
