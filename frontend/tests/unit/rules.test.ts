// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content';
import { type Content, type GameState, newGame } from '../../src/domain';
import { apply, type Command, type GameEvent } from '../../src/rules';

const floor = [
  { x: 0, y: 500 },
  { x: 1000, y: 500 },
  { x: 1000, y: 600 },
  { x: 0, y: 600 },
];
const place = { verb: 'Look at', name: 'it' };

const files: Record<string, any> = {
  'content/worlds.json': {
    worlds: [
      { id: 'street', name: 'Street', start: 'street' },
      { id: 'online', name: 'Online', start: 'feed', locked: 'Not yet.' },
      { id: 'dream', name: 'Dream', start: 'dream' },
    ],
  },
  'content/items.json': {
    start: ['guitar'],
    items: {
      guitar: { name: 'Guitar', noUse: 'Not the guitar.' },
      flyer: { name: 'Flyer', noUse: 'Not the flyer.' },
    },
  },
  'content/characters.json': {
    protagonist: { model: 'character/protagonist' },
    characters: [{ id: 'bartender', name: 'Bartender', model: 'character/bartender' }],
  },
  'content/objects.json': { objects: [{ id: 'flyer', name: 'Flyer', model: 'object/flyer' }] },
  'content/rooms/street.json': {
    model: 'scene/street',
    world: 'street',
    label: 'STREET',
    place,
    hint: '',
    start: { x: 100, y: 550 },
    walkable: floor,
    hotspots: [
      {
        id: 'door',
        name: 'Door',
        verb: 'Go in',
        target: { node: 'door' },
        walkTo: { x: 500, y: 550 },
        interactions: [{ verb: 'go', effects: [{ goTo: 'pub' }] }],
      },
      {
        id: 'flyer',
        name: 'Flyer',
        verb: 'Pick up',
        target: { entity: 'flyer', at: { x: 200, y: 520 } },
        walkTo: { x: 200, y: 550 },
        interactions: [{ verb: 'pickup', effects: [{ gather: 'open-mic' }, { pickUp: 'flyer' }] }],
        presentWhen: [{ not: { pickedUp: 'flyer' } }],
      },
      {
        id: 'sign',
        name: 'Sign',
        verb: 'Look at',
        target: { node: 'sign' },
        walkTo: { x: 420, y: 550 },
        interactions: [{ verb: 'look', effects: [{ say: 'A sign.' }] }],
      },
      {
        id: 'echo',
        name: 'Echo',
        verb: 'Listen to',
        target: { node: 'echo' },
        walkTo: { x: 300, y: 550 },
        interactions: [{ verb: 'look', effects: [{ say: "Nine o'clock." }] }],
        presentWhen: [{ gathered: 'open-mic' }],
      },
    ],
  },
  'content/rooms/pub.json': {
    model: 'scene/pub',
    world: 'street',
    label: 'PUB',
    place,
    hint: '',
    start: { x: 300, y: 550 },
    walkable: floor,
    hotspots: [
      {
        id: 'door',
        name: 'Door',
        verb: 'Go out',
        target: { node: 'door' },
        walkTo: { x: 100, y: 550 },
        interactions: [{ verb: 'go', effects: [{ goTo: 'street', at: { x: 510, y: 560 } }] }],
      },
      {
        id: 'bar',
        name: 'Bar',
        verb: 'Look at',
        target: { node: 'bar' },
        walkTo: { x: 800, y: 550 },
        interactions: [
          { verb: 'look', effects: [{ say: 'A bar.' }] },
          { verb: 'use', item: 'flyer', effects: [{ say: 'Pinned up.' }, { take: 'flyer' }] },
        ],
      },
      {
        id: 'bartender',
        name: 'Bartender',
        verb: 'Talk to',
        target: { entity: 'bartender', at: { x: 700, y: 520 } },
        walkTo: { x: 700, y: 550 },
        interactions: [{ verb: 'talk', effects: [{ talk: 'bartender' }] }],
      },
    ],
  },
  'content/rooms/feed.json': {
    model: 'scene/feed',
    world: 'online',
    label: 'FEED',
    place,
    hint: '',
    start: { x: 100, y: 550 },
    walkable: floor,
    hotspots: [],
  },
  'content/rooms/dream.json': {
    model: 'scene/dream',
    world: 'dream',
    label: 'DREAM',
    place,
    hint: '',
    start: { x: 600, y: 550 },
    walkable: floor,
    hotspots: [
      {
        id: 'flyer',
        name: 'Flyer',
        verb: 'Look at',
        target: { entity: 'flyer', at: { x: 700, y: 520 } },
        walkTo: { x: 700, y: 550 },
        interactions: [{ verb: 'look', effects: [{ say: 'Open mic.' }] }],
        presentWhen: [{ gathered: 'open-mic' }],
      },
    ],
  },
};
const content = loadContent(files);

/** The fixture content with `edit` applied to a copy of the room file at `room`. */
function editedRoom(room: string, edit: (room: any) => void): Content {
  const copy = structuredClone(files);
  edit(copy[`content/rooms/${room}.json`]);
  return loadContent(copy);
}

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
  it('starts at the start room, carrying the start items', () => {
    expect(start()).toEqual({
      room: 'street',
      at: { x: 100, y: 550 },
      inventory: { carried: ['guitar'], pickedUp: [] },
      journey: { left: {}, gathered: [] },
      flags: {},
      selected: null,
      walk: null,
      saying: null,
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
    expect(events.slice(-3)).toEqual([
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

describe('talk', () => {
  it('starts a conversation with the character, leaving the state as it is', () => {
    const inPub = play(start(), [activate('door')]).state;
    const { state, events } = play(inPub, [activate('bartender')]);
    expect(state).toEqual({ ...inPub, at: { x: 700, y: 550 } });
    expect(events.slice(-2)).toEqual([{ type: 'conversationStarted', character: 'bartender' }, { type: 'saved' }]);
  });

  it('changes nothing yet when a conversation reaches its goal', () => {
    const state = start();
    const result: Command = { type: 'dialogueResult', character: 'bartender', goalReached: true };
    expect(apply(content, state, result)).toEqual({ state, events: [] });
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
