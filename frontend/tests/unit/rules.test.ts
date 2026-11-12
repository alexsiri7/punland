// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { type Content, type GameState, newGame, speechMs } from '../../src/domain';
import { apply, type Command, type GameEvent } from '../../src/rules';
import { content, edited, editedRoom } from './fixtures/content';

const activate = (hotspot: string): Command => ({ type: 'activate', hotspot });
const select = (item: string | null): Command => ({ type: 'select', item });
const enterWorld = (world: string): Command => ({ type: 'enterWorld', world });
const tick = (dtMs = 50): Command => ({ type: 'tick', dtMs });

type Step = { state: GameState; events: GameEvent[] };

/** Ticks until the player stands still. */
function walkOn({ state, events }: Step, given = content): Step {
  while (state.walk !== null) {
    const step = apply(given, state, tick());
    state = step.state;
    events = [...events, ...step.events];
  }
  return { state, events };
}

/** Applies each command, walking on after each. */
function play(state: GameState, commands: readonly Command[], given = content): Step {
  let played: Step = { state, events: [] };
  for (const command of commands) {
    const step = apply(given, played.state, command);
    played = walkOn({ state: step.state, events: [...played.events, ...step.events] }, given);
  }
  return played;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

const start = () => newGame(content);

describe('newGame', () => {
  it('starts at the start room, carrying the start items, in the first act with the start stats', () => {
    expect(start()).toEqual({
      room: 'street',
      at: { x: 100, y: 550 },
      inventory: { carried: ['guitar'], pickedUp: [] },
      journey: { left: {}, gathered: [] },
      flags: {},
      stats: { fame: 0, skill: 1 },
      act: 'one',
      goals: [],
      visited: ['street'],
      back: null,
      selected: null,
      walk: null,
      saying: null,
      cue: null,
    });
  });
});

describe('walk and tick', () => {
  it('clamps a walk to the floor', () => {
    const { state } = apply(content, start(), { type: 'walk', to: { x: 400, y: 100 } });
    expect(state.walk).toEqual({ target: { x: 400, y: 500 }, then: null });
  });

  it('walks at 320 px/s and stops on the target', () => {
    let { state } = apply(content, start(), { type: 'walk', to: { x: 420, y: 550 } });
    let step = apply(content, state, tick(500));
    expect(step.state.at).toEqual({ x: 260, y: 550 });
    expect(step.events).toEqual([{ type: 'moved', at: { x: 260, y: 550 } }]);
    step = apply(content, step.state, tick(500));
    state = step.state;
    expect(state.at).toEqual({ x: 420, y: 550 });
    expect(state.walk).toBeNull();
    expect(step.events).toEqual([{ type: 'moved', at: { x: 420, y: 550 } }, { type: 'arrived' }]);
  });

  it('deselects the item and hushes the player on a floor click', () => {
    const talking = play(start(), [activate('sign'), select('guitar')]).state;
    expect(talking.saying).not.toBeNull();
    const { state, events } = apply(content, talking, { type: 'walk', to: { x: 300, y: 550 } });
    expect(state.selected).toBeNull();
    expect(state.saying).toBeNull();
    expect(events).toEqual([{ type: 'selected', item: null }, { type: 'hushed' }]);
  });

  it('does nothing when the player is standing still', () => {
    const state = start();
    expect(apply(content, state, tick())).toEqual({ state, events: [] });
  });
});

describe('activate', () => {
  it('walks to the hotspot, then runs its action', () => {
    const first = apply(content, start(), activate('sign'));
    expect(first.events).toEqual([]);
    expect(first.state.walk).toEqual({ target: { x: 420, y: 550 }, then: { hotspot: 'sign', item: null } });
    const { state, events } = walkOn(first);
    expect(state.at).toEqual({ x: 420, y: 550 });
    expect(state.saying).toEqual({ line: 'A sign.', by: 'player' });
    expect(events.slice(-3)).toEqual([
      { type: 'arrived' },
      { type: 'said', line: 'A sign.', by: 'player' },
      { type: 'saved' },
    ]);
  });

  it('replaces the pending action when issued mid-walk', () => {
    let { state } = apply(content, start(), activate('door'));
    state = apply(content, state, tick()).state;
    state = apply(content, state, activate('sign')).state;
    expect(state.walk).toEqual({ target: { x: 420, y: 550 }, then: { hotspot: 'sign', item: null } });
    const { state: after, events } = walkOn({ state, events: [] });
    expect(after.room).toBe('street');
    expect(after.saying?.line).toBe('A sign.');
    expect(events.some((e) => e.type === 'roomChanged')).toBe(false);
  });

  it('ignores a hotspot that is not in the room', () => {
    const state = start();
    expect(apply(content, state, activate('bar'))).toEqual({ state, events: [] });
  });
});

describe('pickup', () => {
  it('puts the item in the inventory and hides the hotspot', () => {
    const { state, events } = play(start(), [activate('flyer')]);
    expect(state.inventory).toEqual({ carried: ['guitar', 'flyer'], pickedUp: ['flyer'] });
    expect(events).toEqual(
      expect.arrayContaining([
        { type: 'pickedUp', item: 'flyer', hotspot: 'flyer' },
        { type: 'hotspotHidden', hotspot: 'flyer' },
        { type: 'saved' },
      ]),
    );
    expect(apply(content, state, activate('flyer'))).toEqual({ state, events: [] });
  });

  it('never brings back an item that was picked up and later removed', () => {
    const { state } = play(start(), [
      activate('flyer'),
      activate('door'),
      select('flyer'),
      activate('bar'),
      activate('door'),
    ]);
    expect(state.room).toBe('street');
    expect(state.inventory).toEqual({ carried: ['guitar'], pickedUp: ['flyer'] });
    expect(apply(content, state, activate('flyer'))).toEqual({ state, events: [] });
  });
});

describe('use X on Y', () => {
  const inPub = () => play(start(), [activate('flyer'), activate('door')]).state;

  it("gives the hotspot's response and takes the item it removes", () => {
    const selected = apply(content, inPub(), select('flyer'));
    expect(selected.events).toEqual([{ type: 'selected', item: 'flyer' }]);
    const activated = apply(content, selected.state, activate('bar'));
    expect(activated.state.selected).toBeNull();
    expect(activated.state.walk?.then).toEqual({ hotspot: 'bar', item: 'flyer' });
    const { state, events } = walkOn(activated);
    expect(state.inventory.carried).toEqual(['guitar']);
    expect(events.slice(-4)).toEqual([
      { type: 'used', item: 'flyer', hotspot: 'bar' },
      { type: 'said', line: 'Pinned up.', by: 'player' },
      { type: 'itemRemoved', item: 'flyer' },
      { type: 'saved' },
    ]);
  });

  it("says the item's noUse on a hotspot that doesn't take it, and keeps the item", () => {
    const { state, events } = play(inPub(), [select('guitar'), activate('bar')]);
    expect(state.saying?.line).toBe('Not the guitar.');
    expect(state.inventory.carried).toEqual(['guitar', 'flyer']);
    expect(events.at(-1)).toEqual({ type: 'said', line: 'Not the guitar.', by: 'player' });
    expect(events.map((e) => e.type)).not.toContain('used');
  });
});

describe('use X on another item', () => {
  const combine = (item: string, on: string): Command => ({ type: 'combine', item, on });
  const fix = [{ say: 'Fixed.' }, { take: 'guitar' }, { take: 'flyer' }, { set: 'fixed', to: true }];
  const given = edited({
    items: (file) => {
      file.items.guitar.uses = [
        { item: 'flyer', when: [{ not: { flag: 'torn' } }], effects: fix },
        { item: 'flyer', effects: [{ say: 'Too torn.' }] },
      ];
    },
  });
  const carrying = (flags = {}): GameState => ({
    ...newGame(given),
    inventory: { carried: ['guitar', 'flyer'], pickedUp: [] },
    selected: 'flyer',
    flags,
  });

  it("runs the first of the items' uses for each other whose conditions hold, used either way round", () => {
    for (const [item, on] of [
      ['flyer', 'guitar'],
      ['guitar', 'flyer'],
    ]) {
      const { state, events } = apply(given, { ...carrying(), selected: item! }, combine(item!, on!));
      expect(state).toMatchObject({ selected: null, flags: { fixed: true }, inventory: { carried: [] } });
      expect(events).toEqual([
        { type: 'selected', item: null },
        { type: 'said', line: 'Fixed.', by: 'player' },
        { type: 'itemRemoved', item: 'guitar' },
        { type: 'itemRemoved', item: 'flyer' },
        { type: 'saved' },
      ]);
    }
    expect(apply(given, carrying({ torn: true }), combine('flyer', 'guitar')).state.saying?.line).toBe('Too torn.');
  });

  it('hushes the line said before', () => {
    const saying = { ...carrying(), saying: { line: 'Hm.', by: 'player' } };
    expect(apply(given, saying, combine('flyer', 'guitar')).events.slice(0, 2)).toEqual([
      { type: 'selected', item: null },
      { type: 'hushed' },
    ]);
  });

  it('selects the other item when no use holds, or the items have none for each other, as a select would', () => {
    const gated = edited({
      items: (file) => {
        file.items.guitar.uses = [{ item: 'flyer', when: [{ flag: 'torn' }], effects: fix }];
      },
    });
    const cases: [Content, GameState][] = [
      [gated, carrying()],
      [content, carrying()],
      [given, { ...carrying(), inventory: { carried: ['guitar'], pickedUp: [] } }],
    ];
    for (const [using, state] of cases) {
      expect(apply(using, state, combine('flyer', 'guitar'))).toEqual(apply(using, state, select('guitar')));
    }
    const same = carrying();
    expect(apply(given, same, combine('flyer', 'flyer'))).toEqual({ state: same, events: [] });
  });
});

describe('visited rooms and going back', () => {
  const goBack = { id: 'close', name: 'Close', verb: 'Click', target: { node: 'close' }, walkTo: { x: 300, y: 550 } };
  const given = edited({
    items: (file) => {
      file.items.flyer.onUse = [{ when: [{ world: 'street' }], effects: [{ goTo: 'pub' }] }];
    },
    'rooms/street': (room) => {
      room.hotspots.find((h: { id: string }) => h.id === 'sign').presentWhen = [{ visited: 'pub' }];
    },
    'rooms/pub': (room) => room.hotspots.push({ ...goBack, interactions: [{ verb: 'go', effects: [{ goBack: true }] }] }),
  });
  const withFlyer = (): GameState => ({ ...newGame(given), inventory: { carried: ['guitar', 'flyer'], pickedUp: [] } });
  const useFlyer: Command = { type: 'useItem', item: 'flyer' };

  it('records every room the player has been in, for visited conditions', () => {
    const state = newGame(given);
    expect(state.visited).toEqual(['street']);
    expect(state.room).toBe('street');
    const { state: there } = play(state, [activate('door'), activate('door')], given);
    expect(there.visited).toEqual(['street', 'pub']);
    expect(play(state, [activate('sign')], given).state.saying).toBeNull();
    expect(play(there, [activate('sign')], given).state.saying?.line).toBe('A sign.');
  });

  it('goes back to the room and the spot the player left it from', () => {
    const walked = play(withFlyer(), [{ type: 'walk', to: { x: 250, y: 580 } }], given).state;
    const opened = play(walked, [useFlyer], given).state;
    expect(opened).toMatchObject({ room: 'pub', back: { room: 'street', at: { x: 250, y: 580 } } });
    const { state, events } = play(opened, [activate('close')], given);
    expect(state).toMatchObject({ room: 'street', at: { x: 250, y: 580 }, back: { room: 'pub', at: { x: 300, y: 550 } } });
    expect(events).toContainEqual({ type: 'roomChanged', room: 'street', at: { x: 250, y: 580 } });
  });

  it('goes back within the world, past a trip to another world', () => {
    const opened = play(withFlyer(), [useFlyer], given).state;
    const away = play(opened, [enterWorld('dream'), enterWorld('street')], given).state;
    expect(away).toMatchObject({ room: 'pub', back: { room: 'street' } });
    expect(play(away, [activate('close')], given).state.room).toBe('street');
  });

  it("goes back to the world's start with nowhere to go back to", () => {
    const inPub = { ...newGame(given), room: 'pub', at: { x: 300, y: 550 } };
    expect(play(inPub, [activate('close')], given).state).toMatchObject({ room: 'street', at: { x: 100, y: 550 } });
  });
});

describe('use an item on its own', () => {
  const given = edited({
    items: (file) => {
      file.items.flyer.onUse = [{ when: [{ world: 'street' }], effects: [{ say: 'Open mic tonight.' }] }];
    },
  });
  const carrying = (state = newGame(given)): GameState => ({
    ...state,
    inventory: { carried: ['guitar', 'flyer'], pickedUp: [] },
    saying: { line: 'Hm.', by: 'player' },
  });
  const useItem = (item: string): Command => ({ type: 'useItem', item });

  it('runs its first reaction that holds, with nothing selected', () => {
    const { state, events } = apply(given, { ...carrying(), selected: null }, useItem('flyer'));
    expect(state).toMatchObject({ selected: null, saying: { line: 'Open mic tonight.' } });
    expect(events).toEqual([{ type: 'hushed' }, { type: 'said', line: 'Open mic tonight.', by: 'player' }, { type: 'saved' }]);
  });

  it('selects an item with no use of its own, or none that holds, as a select would', () => {
    const inDream = carrying({ ...newGame(given), room: 'dream' });
    const cases: [Content, GameState, string][] = [
      [given, carrying(), 'guitar'],
      [given, inDream, 'flyer'],
      [content, carrying(), 'flyer'],
    ];
    for (const [using, state, item] of cases) {
      expect(apply(using, state, useItem(item))).toEqual(apply(using, state, select(item)));
    }
  });

  it('does nothing with an item the player does not carry', () => {
    const state = newGame(given);
    expect(apply(given, state, useItem('flyer'))).toEqual({ state, events: [] });
  });
});

describe('cutscenes', () => {
  const begin: Command = { type: 'begin' };
  const scene = [{ wait: 500 }, { set: 'echo', to: true }, { say: 'Hear that?' }, { say: 'Gone.' }, { set: 'met', to: true }];
  const paced = [...scene.slice(0, 3), { wait: speechMs('Hear that?') }, scene[3], { wait: speechMs('Gone.') }, scene[4]];
  const given = editedRoom('street', (room) => {
    room.hotspots.find((h: { id: string }) => h.id === 'echo').presentWhen = [{ flag: 'echo' }];
    room.onStart = [{ when: [{ not: { flag: 'met' } }], effects: scene }];
  });

  it("begins with the room's cutscene, once its conditions hold", () => {
    const { state, events } = apply(given, newGame(given), begin);
    expect(state.cue).toEqual({ ms: 500, effects: paced.slice(1), hotspot: null });
    expect(events).toEqual([{ type: 'saved' }]);
    const met = { ...newGame(given), flags: { met: true } };
    expect(apply(given, met, begin)).toEqual({ state: met, events: [] });
    expect(apply(content, newGame(content), begin)).toEqual({ state: newGame(content), events: [] });
  });

  it('runs the rest of the effects once each wait is over, each line waiting while it is up', () => {
    let step = apply(given, newGame(given), begin);
    step = apply(given, step.state, tick(200));
    expect(step).toEqual({ state: { ...step.state, cue: { ms: 300, effects: paced.slice(1), hotspot: null } }, events: [] });
    step = apply(given, step.state, tick(300));
    expect(step.state.cue).toEqual({ ms: speechMs('Hear that?'), effects: paced.slice(4), hotspot: null });
    expect(step.events).toEqual([
      { type: 'said', line: 'Hear that?', by: 'player' },
      { type: 'hotspotShown', hotspot: 'echo' },
      { type: 'saved' },
    ]);
    step = apply(given, step.state, tick(speechMs('Hear that?')));
    expect(step.state.cue).toEqual({ ms: speechMs('Gone.'), effects: paced.slice(6), hotspot: null });
    expect(step.events).toEqual([{ type: 'said', line: 'Gone.', by: 'player' }, { type: 'saved' }]);
    step = apply(given, step.state, tick(speechMs('Gone.')));
    expect(step.state).toMatchObject({ cue: null, flags: { echo: true, met: true } });
  });

  it("ignores the player's commands until the cutscene is over", () => {
    const waiting = apply(given, newGame(given), begin).state;
    const input: Command[] = [
      { type: 'walk', to: { x: 400, y: 550 } },
      activate('door'),
      select('guitar'),
      { type: 'combine', item: 'guitar', on: 'guitar' },
      { type: 'useItem', item: 'guitar' },
      enterWorld('dream'),
      begin,
    ];
    for (const command of input) expect(apply(given, waiting, command)).toEqual({ state: waiting, events: [] });
  });

  it("waits in a hotspot's interaction, which carries on with that hotspot", () => {
    const waits = editedRoom('street', (room) => {
      room.hotspots.find((h: { id: string }) => h.id === 'flyer').interactions[0].effects = [{ wait: 100 }, { pickUp: 'flyer' }];
    });
    const at = play(newGame(waits), [activate('flyer')], waits).state;
    expect(at.cue).toEqual({ ms: 100, effects: [{ pickUp: 'flyer' }], hotspot: 'flyer' });
    const { state, events } = apply(waits, at, tick(100));
    expect(state.inventory.carried).toContain('flyer');
    expect(events).toEqual([
      { type: 'pickedUp', item: 'flyer', hotspot: 'flyer' },
      { type: 'hotspotHidden', hotspot: 'flyer' },
      { type: 'saved' },
    ]);
  });
});

describe('exit', () => {
  it("arrives at the exit's arrival point", () => {
    const { state, events } = play(start(), [activate('door'), activate('door')]);
    expect(state.room).toBe('street');
    expect(state.at).toEqual({ x: 510, y: 560 });
    expect(events).toContainEqual({ type: 'roomChanged', room: 'street', at: { x: 510, y: 560 } });
  });

  it("arrives at the room's start when the exit names no point", () => {
    const { state, events } = play(start(), [activate('door')]);
    expect(state.room).toBe('pub');
    expect(state.at).toEqual({ x: 300, y: 550 });
    expect(events.slice(-2)).toEqual([{ type: 'roomChanged', room: 'pub', at: { x: 300, y: 550 } }, { type: 'saved' }]);
  });

  it('ends the selection made on the way to the door', () => {
    const walking = apply(content, start(), activate('door')).state;
    const selected = apply(content, walking, select('guitar')).state;
    const { state, events } = walkOn({ state: selected, events: [] });
    expect(state.room).toBe('pub');
    expect(state.selected).toBeNull();
    expect(events).toContainEqual({ type: 'selected', item: null });
  });
});

describe('say', () => {
  it('has the player say a line, or the character it is said by', () => {
    const given = editedRoom('street', (room) => {
      room.hotspots.find((h: { id: string }) => h.id === 'sign').interactions[0].effects.push({
        say: 'Move along.',
        by: 'busker',
      });
    });
    const { state, events } = play(newGame(given), [activate('sign')], given);
    expect(events.filter((e) => e.type === 'said')).toEqual([
      { type: 'said', line: 'A sign.', by: 'player' },
      { type: 'said', line: 'Move along.', by: 'busker' },
    ]);
    expect(state.saying).toEqual({ line: 'Move along.', by: 'busker' });
  });
});

describe('talk', () => {
  it('starts a conversation with the character, leaving the state as it is', () => {
    const inPub = play(start(), [activate('door')]).state;
    const { state, events } = play(inPub, [activate('bartender')]);
    expect(state).toEqual({ ...inPub, at: { x: 700, y: 550 } });
    expect(events.slice(-2)).toEqual([{ type: 'conversationStarted', character: 'bartender' }, { type: 'saved' }]);
  });
});

describe('stats and acts', () => {
  const reached = (character = 'bartender', goalReached = true): Command => ({
    type: 'dialogueResult',
    character,
    goalReached,
  });
  const inPub = (given = content) => play(newGame(given), [activate('door')], given).state;
  /** The fixture content, with the bar running `effects` when looked at, while `when` holds. */
  const barDoes = (effects: unknown[], when?: unknown[]) =>
    editedRoom('pub', (room) =>
      room.hotspots
        .find((h: { id: string }) => h.id === 'bar')
        .interactions.unshift({ verb: 'look', ...(when && { when }), effects }),
    );

  it("runs the first of the character's goal reactions whose conditions hold", () => {
    const { state, events } = apply(content, start(), reached());
    expect(state.stats).toEqual({ fame: 10, skill: 1 });
    expect(state.goals).toEqual(['job']);
    expect(events).toEqual([
      { type: 'statChanged', stat: 'fame', value: 10 },
      { type: 'goalReached', goal: 'job' },
      { type: 'saved' },
    ]);
    expect(apply(content, state, reached())).toEqual({ state, events: [] });
  });

  it('changes nothing when the goal is not reached, or the character has no goal reactions', () => {
    const state = start();
    expect(apply(content, state, reached('bartender', false))).toEqual({ state, events: [] });
    expect(apply(content, state, reached('busker'))).toEqual({ state, events: [] });
    expect(apply(content, state, reached('nobody'))).toEqual({ state, events: [] });
  });

  it('changes a stat by any amount', () => {
    const given = barDoes([{ changeStat: 'skill', by: -3 }]);
    const { state, events } = play(inPub(given), [activate('bar')], given);
    expect(state.stats).toEqual({ fame: 0, skill: -2 });
    expect(events.slice(-2)).toEqual([{ type: 'statChanged', stat: 'skill', value: -2 }, { type: 'saved' }]);
  });

  it("reaches only the current act's goals, once", () => {
    const given = barDoes([{ reachGoal: 'gig' }, { reachGoal: 'guitar' }, { reachGoal: 'guitar' }]);
    const { state, events } = play(inPub(given), [activate('bar')], given);
    expect(state.goals).toEqual(['guitar']);
    expect(events.slice(-2)).toEqual([{ type: 'goalReached', goal: 'guitar' }, { type: 'saved' }]);
  });

  it("starts the next act once all the act's goals are reached, and runs the effects after in it", () => {
    const given = barDoes([{ reachGoal: 'job' }, { reachGoal: 'guitar' }, { reachGoal: 'gig' }]);
    const { state, events } = play(inPub(given), [activate('bar')], given);
    expect(state).toMatchObject({ act: 'band', goals: [] });
    expect(events.slice(-6)).toEqual([
      { type: 'goalReached', goal: 'job' },
      { type: 'goalReached', goal: 'guitar' },
      { type: 'actStarted', act: 'two' },
      { type: 'goalReached', goal: 'gig' },
      { type: 'actStarted', act: 'band' },
      { type: 'saved' },
    ]);
  });

  it('chooses the next act from the stats', () => {
    const inActTwo = { ...start(), act: 'two' };
    const famous = apply(content, { ...inActTwo, stats: { fame: 100, skill: 1 } }, reached());
    expect(famous.state).toMatchObject({ act: 'star', goals: [] });
    expect(famous.events).toContainEqual({ type: 'actStarted', act: 'star' });
    expect(apply(content, { ...inActTwo, stats: { fame: 99, skill: 50 } }, reached()).state.act).toBe('band');
  });

  it('stays in a final act once its goals are reached', () => {
    const given = barDoes([{ reachGoal: 'headline' }]);
    const done = play({ ...inPub(given), act: 'star' }, [activate('bar')], given).state;
    expect(done).toMatchObject({ act: 'star', goals: ['headline'] });
  });

  it('gates interactions on stats, the act and its goals', () => {
    const given = barDoes(
      [{ say: 'Regular.' }],
      [{ stat: 'fame', atLeast: 10 }, { act: 'one' }, { goal: 'job' }],
    );
    const said = (state: GameState) => play(state, [activate('bar')], given).state.saying?.line;
    const pub = inPub(given);
    expect(said(pub)).toBe('A bar.');
    expect(said({ ...pub, stats: { fame: 10, skill: 1 } })).toBe('A bar.');
    expect(said({ ...pub, stats: { fame: 10, skill: 1 }, goals: ['job'] })).toBe('Regular.');
    expect(said({ ...pub, stats: { fame: 10, skill: 1 }, goals: ['job'], act: 'two' })).toBe('A bar.');
  });
});

describe('interactions as data', () => {
  const inPub = (given = content) => play(newGame(given), [activate('door')], given).state;
  const bartender = (room: any) => room.hotspots.find((h: { id: string }) => h.id === 'bartender');

  it('plays a puzzle step added to the content, with no code change', () => {
    const line = 'I show the bartender my broken guitar. She winces.';
    const given = editedRoom('pub', (room) =>
      bartender(room).interactions.push({
        verb: 'use',
        item: 'guitar',
        effects: [{ say: line }, { set: 'showed-guitar', to: true }],
      }),
    );
    const { state, events } = play(inPub(given), [select('guitar'), activate('bartender')], given);
    expect(state.flags).toEqual({ 'showed-guitar': true });
    expect(state.inventory.carried).toEqual(['guitar']);
    expect(events.slice(-2)).toEqual([{ type: 'said', line, by: 'player' }, { type: 'saved' }]);
  });

  it('runs the first interaction whose conditions hold', () => {
    const given = editedRoom('pub', (room) =>
      bartender(room).interactions.unshift(
        { verb: 'talk', when: [{ flag: 'served' }], effects: [{ say: 'Already served.' }] },
        { verb: 'talk', when: [{ not: { has: 'guitar' } }], effects: [{ say: 'No guitar?' }] },
        { verb: 'use', item: 'guitar', when: [{ flag: 'served', is: false }], effects: [{ set: 'served', to: true }] },
      ),
    );
    let { state, events } = play(inPub(given), [activate('bartender')], given);
    expect(events).toContainEqual({ type: 'conversationStarted', character: 'bartender' });
    ({ state } = play(state, [select('guitar'), activate('bartender')], given));
    expect(state.saying?.line).toBe('Not the guitar.');
    state = { ...state, flags: { served: false } };
    ({ state } = play(state, [select('guitar'), activate('bartender'), activate('bartender')], given));
    expect(state.flags).toEqual({ served: true });
    expect(state.saying?.line).toBe('Already served.');
  });

  it('gives and takes items', () => {
    const given = editedRoom('pub', (room) =>
      bartender(room).interactions.unshift({ verb: 'talk', effects: [{ give: 'flyer' }, { take: 'guitar' }] }),
    );
    const { state, events } = play(inPub(given), [activate('bartender')], given);
    expect(state.inventory).toEqual({ carried: ['flyer'], pickedUp: [] });
    expect(events.slice(-3)).toEqual([
      { type: 'itemAdded', item: 'flyer' },
      { type: 'itemRemoved', item: 'guitar' },
      { type: 'saved' },
    ]);
    expect(play(state, [activate('bartender')], given).events.slice(-1)).toEqual([{ type: 'saved' }]);
  });

  it('picks up an item the player already carries without carrying it twice', () => {
    const given = editedRoom('pub', (room) =>
      bartender(room).interactions.unshift({ verb: 'talk', effects: [{ give: 'flyer' }, { pickUp: 'flyer' }] }),
    );
    const once = play(inPub(given), [activate('bartender')], given).state;
    expect(once.inventory).toEqual({ carried: ['guitar', 'flyer'], pickedUp: ['flyer'] });
    const { state, events } = play(once, [activate('bartender')], given);
    expect(state.inventory).toEqual(once.inventory);
    expect(events.slice(-2)).toEqual([{ type: 'pickedUp', item: 'flyer', hotspot: 'bartender' }, { type: 'saved' }]);
  });

  it('gathers dream material only once', () => {
    const given = editedRoom('street', (room) => {
      room.hotspots.find((h: { id: string }) => h.id === 'sign').interactions[0].effects.push({ gather: 'open-mic' });
    });
    const once = play(newGame(given), [activate('sign')], given).state;
    expect(once.journey.gathered).toEqual(['open-mic']);
    const { state, events } = play(once, [activate('sign')], given);
    expect(state.journey.gathered).toEqual(['open-mic']);
    expect(events).not.toContainEqual({ type: 'gathered', material: 'open-mic' });
  });

  it("shows and hides the room's hotspots as their conditions change", () => {
    const given = editedRoom('pub', (room) => {
      bartender(room).presentWhen = [{ flag: 'open' }];
      room.hotspots.find((h: { id: string }) => h.id === 'bar').interactions.unshift(
        { verb: 'look', when: [{ flag: 'open' }], effects: [{ set: 'open', to: false }] },
        { verb: 'look', effects: [{ set: 'open', to: true }] },
      );
    });
    const closed = inPub(given);
    expect(apply(given, closed, activate('bartender'))).toEqual({ state: closed, events: [] });
    const opened = play(closed, [activate('bar')], given);
    expect(opened.events.slice(-2)).toEqual([{ type: 'hotspotShown', hotspot: 'bartender' }, { type: 'saved' }]);
    const closedAgain = play(opened.state, [activate('bar')], given);
    expect(closedAgain.events.slice(-2)).toEqual([{ type: 'hotspotHidden', hotspot: 'bartender' }, { type: 'saved' }]);
  });

  it('does nothing when no interaction holds', () => {
    const given = editedRoom('street', (room) => {
      room.hotspots.find((h: { id: string }) => h.id === 'sign').interactions[0].when = [{ has: 'flyer' }];
    });
    const walked = apply(given, newGame(given), activate('sign'));
    const { state, events } = walkOn(walked, given);
    expect(state.saying).toBeNull();
    expect(events.at(-1)).toEqual({ type: 'arrived' });
  });
});

describe('enterWorld', () => {
  it('enters a world at its start the first time, and comes back to the spot the player left', () => {
    const walked = play(start(), [{ type: 'walk', to: { x: 250, y: 580 } }]).state;
    const dream = play(walked, [enterWorld('dream')]);
    expect(dream.state.room).toBe('dream');
    expect(dream.state.at).toEqual({ x: 600, y: 550 });
    expect(dream.events).toEqual([
      { type: 'roomChanged', room: 'dream', at: { x: 600, y: 550 } },
      { type: 'worldChanged', world: 'dream' },
      { type: 'saved' },
    ]);
    const moved = play(dream.state, [{ type: 'walk', to: { x: 900, y: 520 } }]).state;
    const back = play(moved, [enterWorld('street')]).state;
    expect(back.room).toBe('street');
    expect(back.at).toEqual({ x: 250, y: 580 });
    const again = play(back, [enterWorld('dream')]).state;
    expect(again.at).toEqual({ x: 900, y: 520 });
  });

  it('ends the selection and speech', () => {
    const talking = play(start(), [activate('sign'), select('guitar')]).state;
    expect(talking.saying).not.toBeNull();
    const { state, events } = apply(content, talking, enterWorld('dream'));
    expect(state).toMatchObject({ room: 'dream', selected: null, saying: null });
    expect(events.slice(0, 2)).toEqual([{ type: 'selected', item: null }, { type: 'hushed' }]);
  });

  it("can't enter a locked world, an unknown one, or the one the player is in", () => {
    const state = start();
    for (const world of ['online', 'nowhere', 'street']) {
      expect(apply(content, state, enterWorld(world))).toEqual({ state, events: [] });
    }
  });

  describe('a locked world with unlock conditions', () => {
    const both = edited({
      worlds: (file) => {
        Object.assign(file.worlds[2], { locked: 'Not dreaming yet.', unlockWhen: [{ flag: 'dreaming' }] });
      },
      'rooms/street': (room) => {
        const sign = room.hotspots.find((h: { id: string }) => h.id === 'sign');
        sign.interactions[0].effects.push({ set: 'dreaming', to: true });
      },
    });

    it("can't be entered until they hold, and unlocks once, as they come to hold", () => {
      expect(apply(both, start(), enterWorld('dream'))).toEqual({ state: start(), events: [] });
      const { state, events } = play(newGame(both), [activate('sign')], both);
      expect(events.filter((e) => e.type === 'worldUnlocked')).toEqual([{ type: 'worldUnlocked', world: 'dream' }]);
      expect(events.slice(-2)).toEqual([{ type: 'worldUnlocked', world: 'dream' }, { type: 'saved' }]);
      const again = play(state, [activate('sign')], both);
      expect(again.events).not.toContainEqual({ type: 'worldUnlocked', world: 'dream' });
      expect(play(state, [enterWorld('dream')], both).state.room).toBe('dream');
    });

    it('a locked world without them never unlocks', () => {
      const { state, events } = play(newGame(both), [activate('sign')], both);
      expect(events).not.toContainEqual({ type: 'worldUnlocked', world: 'online' });
      expect(apply(both, state, enterWorld('online'))).toEqual({ state, events: [] });
    });
  });
});

describe('dream material', () => {
  it('is gathered by doing the hotspot that gives it, and shows the dream hotspot shown with it', () => {
    const first = play(start(), [enterWorld('dream')]).state;
    expect(apply(content, first, activate('flyer'))).toEqual({ state: first, events: [] });
    expect(apply(content, start(), activate('echo')).events).toEqual([]);
    const { state, events } = play(start(), [activate('flyer'), enterWorld('dream')]);
    expect(events).toContainEqual({ type: 'gathered', material: 'open-mic' });
    expect(events).toContainEqual({ type: 'hotspotShown', hotspot: 'echo' });
    expect(state.journey.gathered).toEqual(['open-mic']);
    expect(play(state, [activate('flyer')]).state.saying?.line).toBe('Open mic.');
  });
});

describe('apply', () => {
  const states = [
    start(),
    play(start(), [activate('flyer'), activate('door'), select('flyer')]).state,
    play(start(), [enterWorld('dream')]).state,
  ];
  const commands: Command[] = [
    { type: 'walk', to: { x: 2000, y: 0 } },
    activate('door'),
    activate('bar'),
    activate('bartender'),
    activate('flyer'),
    { type: 'dialogueResult', character: 'bartender', goalReached: true },
    select('guitar'),
    select(null),
    { type: 'combine', item: 'flyer', on: 'guitar' },
    enterWorld('dream'),
    enterWorld('street'),
    tick(),
  ];

  it('is deterministic and never mutates its inputs', () => {
    for (const initial of states) {
      for (const command of commands) {
        const state = deepFreeze(structuredClone(initial));
        const frozenContent = deepFreeze(structuredClone(content));
        let first = apply(frozenContent, state, deepFreeze({ ...command }));
        expect(apply(frozenContent, state, command)).toEqual(first);
        while (first.state.walk !== null) {
          const walking = deepFreeze(first.state);
          first = apply(frozenContent, walking, tick());
          expect(apply(frozenContent, walking, tick())).toEqual(first);
        }
        expect(state).toEqual(initial);
      }
    }
  });
});
