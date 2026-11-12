import {
  type Act,
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
  type Speaker,
  speechMs,
  type World,
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
  return allHold(state, hotspot.presentWhen);
}

/** Whether the world can be entered: it isn't locked, or all its `unlockWhen` conditions hold. */
export function isUnlocked(state: GameState, world: World): boolean {
  return world.locked === undefined || (world.unlockWhen !== undefined && allHold(state, world.unlockWhen));
}

/**
 * `world` is the world the player is in, for `world` conditions; the content validators keep
 * those in items' `onUse`, the one place that passes it.
 */
function holds(state: GameState, condition: Condition, world: string | null): boolean {
  if ('has' in condition) return state.inventory.carried.includes(condition.has);
  if ('pickedUp' in condition) return state.inventory.pickedUp.includes(condition.pickedUp);
  if ('gathered' in condition) return state.journey.gathered.includes(condition.gathered);
  if ('flag' in condition) return state.flags[condition.flag] === (condition.is ?? true);
  if ('stat' in condition) return (state.stats[condition.stat] ?? 0) >= condition.atLeast;
  if ('act' in condition) return state.act === condition.act;
  if ('goal' in condition) return state.goals.includes(condition.goal);
  if ('visited' in condition) return state.visited.includes(condition.visited);
  if ('world' in condition) return condition.world === world;
  return !holds(state, condition.not, world);
}

/** What the player does, which waits while a cutscene's `wait` counts down. */
const INPUT = new Set<Command['type']>(['walk', 'activate', 'select', 'combine', 'useItem', 'enterWorld', 'begin']);

function step(content: Content, state: GameState, command: Command, events: GameEvent[]): GameState {
  if (state.cue && INPUT.has(command.type)) return state;
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
    case 'combine':
      return combine(content, state, command.item, command.on, events);
    case 'useItem':
      return useItem(content, state, command.item, events);
    case 'begin': {
      const reaction = roomOf(content, state.room).onStart?.find(({ when }) => allHold(state, when));
      return reaction ? runEffects(content, state, paced(reaction.effects), null, events) : state;
    }
    case 'enterWorld':
      return enterWorld(content, state, command.world, events);
    case 'tick':
      return tick(content, state, command.dtMs, events);
    case 'dialogueResult': {
      if (!command.goalReached) return state;
      const character = Object.hasOwn(content.characters, command.character)
        ? content.characters[command.character]
        : undefined;
      const reaction = character?.onGoal?.find(({ when }) => allHold(state, when));
      return reaction ? runEffects(content, state, reaction.effects, null, events) : state;
    }
    default:
      return command satisfies never;
  }
}

function tick(content: Content, state: GameState, dtMs: number, events: GameEvent[]): GameState {
  const cued = state.cue ? countDown(content, state, state.cue, dtMs, events) : state;
  return cued.walk ? walkOn(content, cued, cued.walk, dtMs, events) : cued;
}

/** A cutscene's effects, each line followed by a wait while it is up, so no click can hush the rest. */
function paced(effects: readonly Effect[]): Effect[] {
  return effects.flatMap((effect): Effect[] => ('say' in effect ? [effect, { wait: speechMs(effect.say) }] : [effect]));
}

/** A `wait` counting down; once it is over, the rest of its effects run. */
function countDown(
  content: Content,
  state: GameState,
  { ms, effects, hotspot }: NonNullable<GameState['cue']>,
  dtMs: number,
  events: GameEvent[],
): GameState {
  if (ms > dtMs) return { ...state, cue: { ms: ms - dtMs, effects, hotspot } };
  const on = hotspot === null ? null : (roomOf(content, state.room).hotspots.find((h) => h.id === hotspot) ?? null);
  return runEffects(content, { ...state, cue: null }, effects, on, events);
}

function walkOn(
  content: Content,
  state: GameState,
  walk: NonNullable<GameState['walk']>,
  dtMs: number,
  events: GameEvent[],
): GameState {
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
    allHold(state, interaction.when);
  const interaction = hotspot.interactions.find(matches);
  if (!interaction) {
    const noUse = item === null ? undefined : content.items[item]?.noUse;
    return noUse === undefined ? state : say(state, noUse, 'player', events);
  }
  if (item !== null) events.push({ type: 'used', item, hotspot: hotspot.id });
  return runEffects(content, state, interaction.effects, hotspot, events);
}

/** A carried item used on its own: its first `onUse` reaction that holds, or else it is selected. */
function useItem(content: Content, state: GameState, item: string, events: GameEvent[]): GameState {
  if (!state.inventory.carried.includes(item)) return state;
  const world = roomOf(content, state.room).world;
  const onUse = Object.hasOwn(content.items, item) ? content.items[item]?.onUse : undefined;
  const reaction = onUse?.find(({ when }) => allHold(state, when, world));
  if (!reaction) return select(state, item, events);
  return runEffects(content, hush(select(state, null, events), events), reaction.effects, null, events);
}

/** Using one carried item on another: the first use either has for the other whose conditions hold. */
function combine(content: Content, state: GameState, item: string, on: string, events: GameEvent[]): GameState {
  const { carried } = state.inventory;
  const usesOf = (id: string, other: string) =>
    (Object.hasOwn(content.items, id) ? content.items[id]?.uses : undefined)?.filter((use) => use.item === other) ?? [];
  const use =
    item !== on && carried.includes(item) && carried.includes(on)
      ? [...usesOf(on, item), ...usesOf(item, on)].find(({ when }) => allHold(state, when))
      : undefined;
  if (!use) return select(state, on, events);
  return runEffects(content, hush(select(state, null, events), events), use.effects, null, events);
}

function allHold(state: GameState, conditions: Condition[] | undefined, world: string | null = null): boolean {
  return conditions?.every((condition) => holds(state, condition, world)) ?? true;
}

/**
 * The effects in order, of an interaction with `hotspot` or, with none, of a reaction, up to a
 * `wait`, which leaves the rest to `cue`; then the room's hotspots that came or went, unless the
 * player left the room, the worlds that unlocked, and a save.
 */
function runEffects(
  content: Content,
  state: GameState,
  effects: readonly Effect[],
  hotspot: Hotspot | null,
  events: GameEvent[],
): GameState {
  const room = roomOf(content, state.room);
  let next = state;
  for (const [i, effect] of effects.entries()) {
    if ('wait' in effect) {
      next = { ...next, cue: { ms: effect.wait, effects: effects.slice(i + 1), hotspot: hotspot?.id ?? null } };
      break;
    }
    next = run(content, next, effect, hotspot, events);
  }
  if (next.room === state.room) {
    for (const h of room.hotspots) {
      const was = isPresent(state, h);
      if (was !== isPresent(next, h)) events.push({ type: was ? 'hotspotHidden' : 'hotspotShown', hotspot: h.id });
    }
  }
  for (const world of content.worlds) {
    if (!isUnlocked(state, world) && isUnlocked(next, world)) events.push({ type: 'worldUnlocked', world: world.id });
  }
  events.push({ type: 'saved' });
  return next;
}

/** One effect of an interaction with `hotspot`, or of a reaction; `runEffects` takes the waits. */
function run(
  content: Content,
  state: GameState,
  effect: Exclude<Effect, { wait: number }>,
  hotspot: Hotspot | null,
  events: GameEvent[],
): GameState {
  if ('say' in effect) return say(state, effect.say, effect.by ?? 'player', events);
  if ('goTo' in effect) {
    return go(content, state, effect.at ? { room: effect.goTo, at: effect.at } : { room: effect.goTo }, events);
  }
  if ('goBack' in effect) {
    return go(content, state, state.back ?? { room: worldOf(content, state.room).start }, events);
  }
  // The content validators keep `pickUp` in hotspots' interactions.
  if ('pickUp' in effect) return hotspot ? pickUp(state, effect.pickUp, hotspot, events) : state;
  if ('give' in effect) return give(state, effect.give, events);
  if ('take' in effect) return take(state, effect.take, events);
  if ('gather' in effect) return gather(state, effect.gather, events);
  if ('set' in effect) return { ...state, flags: { ...state.flags, [effect.set]: effect.to } };
  if ('changeStat' in effect) return changeStat(state, effect.changeStat, effect.by, events);
  if ('reachGoal' in effect) return reachGoal(content, state, effect.reachGoal, events);
  events.push({ type: 'conversationStarted', character: effect.talk });
  return state;
}

/** The player leaves this world where they stand, and comes back to the same spot; its start the first time. */
function enterWorld(content: Content, state: GameState, id: string, events: GameEvent[]): GameState {
  const world = content.worlds.find((w) => w.id === id);
  const current = roomOf(content, state.room).world;
  if (!world || !isUnlocked(state, world) || world.id === current) return state;
  const left = { ...state.journey.left, [current]: { room: state.room, at: { ...state.at } } };
  const place = left[world.id] ?? { room: world.start };
  const next = arrive(content, { ...state, journey: { ...state.journey, left } }, place, events);
  events.push({ type: 'saved' });
  return next;
}

/** Into a room by an exit, the room left becoming where `goBack` returns to. */
function go(content: Content, state: GameState, place: Place, events: GameEvent[]): GameState {
  const back = place.room === state.room ? state.back : { room: state.room, at: { ...state.at } };
  return arrive(content, { ...state, back }, place, events);
}

/** Into another room: at `place.at`, or the room's start. Walking, the selection and speech end. */
function arrive(content: Content, state: GameState, place: Place, events: GameEvent[]): GameState {
  const room = roomOf(content, place.room);
  const at = { ...(place.at ?? room.start) };
  const from = roomOf(content, state.room).world;
  const next = hush(select(state, null, events), events);
  events.push({ type: 'roomChanged', room: place.room, at });
  if (room.world !== from) events.push({ type: 'worldChanged', world: room.world });
  const visited = next.visited.includes(place.room) ? next.visited : [...next.visited, place.room];
  return { ...next, room: place.room, at, walk: null, visited };
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

function changeStat(state: GameState, stat: string, by: number, events: GameEvent[]): GameState {
  const value = (state.stats[stat] ?? 0) + by;
  events.push({ type: 'statChanged', stat, value });
  return { ...state, stats: { ...state.stats, [stat]: value } };
}

/**
 * A goal of the current act; a goal of another act, or one already reached, does nothing.
 * Reaching the act's last goal starts the first next act whose conditions hold.
 */
function reachGoal(content: Content, state: GameState, goal: string, events: GameEvent[]): GameState {
  const act = actOf(content, state.act);
  if (!act.goals.some((g) => g.id === goal) || state.goals.includes(goal)) return state;
  events.push({ type: 'goalReached', goal });
  const reached = { ...state, goals: [...state.goals, goal] };
  if (!act.goals.every((g) => reached.goals.includes(g.id))) return reached;
  const next = act.next?.find(({ when }) => allHold(reached, when));
  if (!next) return reached;
  events.push({ type: 'actStarted', act: next.act });
  return { ...reached, act: next.act, goals: [] };
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

function say(state: GameState, line: string, by: Speaker, events: GameEvent[]): GameState {
  events.push({ type: 'said', line, by });
  return { ...state, saying: { line, by } };
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

function actOf(content: Content, id: string): Act {
  const act = content.acts.find((a) => a.id === id);
  if (!act) throw new Error(`act "${id}" is not in the content`);
  return act;
}

function worldOf(content: Content, room: string): World {
  const id = roomOf(content, room).world;
  const world = content.worlds.find((w) => w.id === id);
  if (!world) throw new Error(`world "${id}" is not in the content`);
  return world;
}

function roomOf(content: Content, id: string): Room {
  const room = Object.hasOwn(content.rooms, id) ? content.rooms[id] : undefined;
  if (!room) throw new Error(`room "${id}" is not in the content`);
  return room;
}
