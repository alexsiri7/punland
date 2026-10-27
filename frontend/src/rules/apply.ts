import {
  type Command,
  type Condition,
  type Content,
  type Effect,
  type FloorPoint,
  type GameEvent,
  type GameState,
  type Hotspot,
  type Interaction,
  nearestWalkable,
  type Place,
  type Room,
} from '../domain';

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

/** Whether the hotspot is in its room: all its `presentWhen` conditions hold. */
export function isPresent(state: GameState, hotspot: Hotspot): boolean {
  return hotspot.presentWhen?.every((condition) => holds(state, condition)) ?? true;
}

function holds(state: GameState, condition: Condition): boolean {
  if ('has' in condition) return state.inventory.carried.includes(condition.has);
  if ('pickedUp' in condition) return state.inventory.pickedUp.includes(condition.pickedUp);
  if ('gathered' in condition) return state.journey.gathered.includes(condition.gathered);
  if ('flag' in condition) return state.flags[condition.flag] === (condition.is ?? true);
  return !holds(state, condition.not);
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
    case 'dialogueResult':
      // What a reached goal does comes with acts and goals (#11).
      return state;
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
  return interact(content, arrived, hotspot, walk.then.item, events);
}

/**
 * Activating a hotspot, once the player has walked to it: its first interaction without an
 * item whose conditions hold, or with `item`, its first `use` of that item whose conditions
 * hold, else the item's refusal.
 */
function interact(
  content: Content,
  state: GameState,
  hotspot: Hotspot,
  item: string | null,
  events: GameEvent[],
): GameState {
  const matches = (interaction: Interaction) =>
    (item === null ? interaction.item === undefined : interaction.verb === 'use' && interaction.item === item) &&
    (interaction.when?.every((condition) => holds(state, condition)) ?? true);
  const interaction = hotspot.interactions.find(matches);
  if (!interaction) {
    const noUse = item === null ? undefined : content.items[item]?.noUse;
    return noUse === undefined ? state : say(state, noUse, events);
  }
  const room = roomOf(content, state.room);
  let next = state;
  for (const effect of interaction.effects) next = run(content, next, effect, hotspot, events);
  if (next.room === state.room) {
    for (const h of room.hotspots) {
      const was = isPresent(state, h);
      if (was !== isPresent(next, h)) events.push({ type: was ? 'hotspotHidden' : 'hotspotShown', hotspot: h.id });
    }
  }
  events.push({ type: 'saved' });
  return next;
}

/** One effect of an interaction with `hotspot`. */
function run(content: Content, state: GameState, effect: Effect, hotspot: Hotspot, events: GameEvent[]): GameState {
  if ('say' in effect) return say(state, effect.say, events);
  if ('goTo' in effect) {
    const place = effect.at ? { room: effect.goTo, at: effect.at } : { room: effect.goTo };
    return arrive(content, state, place, events);
  }
  if ('pickUp' in effect) return pickUp(state, effect.pickUp, hotspot, events);
  if ('give' in effect) return give(state, effect.give, events);
  if ('take' in effect) return take(state, effect.take, events);
  if ('gather' in effect) return gather(state, effect.gather, events);
  if ('set' in effect) return { ...state, flags: { ...state.flags, [effect.set]: effect.to } };
  events.push({ type: 'conversationStarted', character: effect.talk });
  return state;
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

/** The item goes into the inventory, and counts as picked up for good. */
function pickUp(state: GameState, item: string, hotspot: Hotspot, events: GameEvent[]): GameState {
  const { carried, pickedUp } = state.inventory;
  events.push({ type: 'pickedUp', item, hotspot: hotspot.id });
  return {
    ...state,
    inventory: {
      carried: carried.includes(item) ? carried : [...carried, item],
      pickedUp: pickedUp.includes(item) ? pickedUp : [...pickedUp, item],
    },
  };
}

function give(state: GameState, item: string, events: GameEvent[]): GameState {
  if (state.inventory.carried.includes(item)) return state;
  events.push({ type: 'itemAdded', item });
  return { ...state, inventory: { ...state.inventory, carried: [...state.inventory.carried, item] } };
}

function take(state: GameState, item: string, events: GameEvent[]): GameState {
  if (!state.inventory.carried.includes(item)) return state;
  events.push({ type: 'itemRemoved', item });
  return { ...state, inventory: { ...state.inventory, carried: state.inventory.carried.filter((id) => id !== item) } };
}

/** Dream material, for the dream's hotspots that are there once it is gathered. */
function gather(state: GameState, material: string, events: GameEvent[]): GameState {
  if (state.journey.gathered.includes(material)) return state;
  events.push({ type: 'gathered', material });
  return { ...state, journey: { ...state.journey, gathered: [...state.journey.gathered, material] } };
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
  const room = Object.hasOwn(content.rooms, id) ? content.rooms[id] : undefined;
  if (!room) throw new Error(`room "${id}" is not in the content`);
  return room;
}
