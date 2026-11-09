import { loadContent } from '../../../src/content';
import type { Content } from '../../../src/domain';
import type { BoundsTable } from '../fakes/renderer';

// Content for the unit tests that are not about the real story: the rules, the session, the app,
// the UI, animation and the renderer swap. The story can change without touching them.

const floor = [
  { x: 0, y: 500 },
  { x: 1000, y: 500 },
  { x: 1000, y: 600 },
  { x: 0, y: 600 },
];
const place = { verb: 'Look at', name: 'it' };

/** The content files, by their path as loadContent takes them. */
export const files: Record<string, any> = {
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
      guitar: {
        name: 'Guitar',
        noUse: 'Not the guitar.',
        uses: [{ item: 'string', effects: [{ say: 'Strung.' }, { take: 'string' }] }],
      },
      flyer: { name: 'Flyer', noUse: 'Not the flyer.' },
      string: { name: 'String', noUse: 'Not the string.' },
    },
  },
  'content/characters.json': {
    protagonist: { model: 'character/protagonist' },
    characters: [
      {
        id: 'bartender',
        name: 'Bartender',
        model: 'character/bartender',
        onGoal: [
          {
            when: [{ act: 'one' }, { not: { goal: 'job' } }],
            effects: [{ changeStat: 'fame', by: 10 }, { reachGoal: 'job' }],
          },
          { when: [{ act: 'two' }], effects: [{ reachGoal: 'gig' }] },
        ],
      },
      { id: 'busker', name: 'Busker', model: 'character/busker' },
    ],
  },
  'content/stats.json': {
    stats: [
      { id: 'fame', name: 'Fame', start: 0 },
      { id: 'skill', name: 'Skill', start: 1 },
    ],
  },
  'content/acts.json': {
    acts: [
      {
        id: 'one',
        name: 'Act One',
        goals: [
          { id: 'guitar', name: 'Fix the guitar' },
          { id: 'job', name: 'Get a job' },
        ],
        next: [{ act: 'two' }],
      },
      {
        id: 'two',
        name: 'Act Two',
        goals: [{ id: 'gig', name: 'Play a gig' }],
        next: [{ act: 'star', when: [{ stat: 'fame', atLeast: 100 }] }, { act: 'band' }],
      },
      { id: 'star', name: 'The Star', goals: [{ id: 'headline', name: 'Headline' }] },
      { id: 'band', name: 'The Band', goals: [{ id: 'record', name: 'Record' }] },
    ],
  },
  'content/objects.json': { objects: [{ id: 'flyer', name: 'Flyer', model: 'object/flyer' }] },
  'content/rooms/street.json': {
    model: 'scene/street',
    world: 'street',
    label: 'STREET',
    place: { verb: 'Outside', name: 'The pub' },
    hint: 'Try the door.',
    start: { x: 100, y: 550 },
    walkable: floor,
    hotspots: [
      {
        id: 'door',
        name: 'Pub door',
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
        interactions: [
          { verb: 'pickup', effects: [{ gather: 'open-mic' }, { pickUp: 'flyer' }, { say: 'An open mic.' }] },
        ],
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
        name: 'Street door',
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
      {
        id: 'busker',
        name: 'Busker',
        verb: 'Listen to',
        target: { entity: 'busker', at: { x: 400, y: 520 } },
        walkTo: { x: 400, y: 550 },
        interactions: [
          {
            verb: 'look',
            effects: [
              { say: 'Evening.', by: 'busker' },
              { say: 'Any requests?', by: 'busker' },
              { say: 'Not tonight.' },
            ],
          },
          { verb: 'use', item: 'guitar', effects: [{ say: 'Nice tune.', by: 'busker' }, { reachGoal: 'guitar' }] },
        ],
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

export const content = loadContent(files);

/** The fixture content with each edit applied to a copy of its file, by its path under content/ without .json. */
export function edited(edits: Record<string, (file: any) => void>): Content {
  const copy = structuredClone(files);
  for (const [path, edit] of Object.entries(edits)) edit(copy[`content/${path}.json`]);
  return loadContent(copy);
}

/** The fixture content with `edit` applied to a copy of the room file at `room`. */
export const editedRoom = (room: string, edit: (room: any) => void): Content => edited({ [`rooms/${room}`]: edit });

/** Each fixture hotspot's bounds in scene pixels, by its room's scene model, as the fake renderer gives them. */
export const bounds: BoundsTable = {
  'scene/street': {
    door: { x: 448, y: 200, width: 128, height: 320 },
    flyer: { x: 180, y: 480, width: 40, height: 40 },
    sign: { x: 380, y: 300, width: 60, height: 80 },
    echo: { x: 280, y: 300, width: 40, height: 60 },
  },
  'scene/pub': {
    door: { x: 40, y: 200, width: 120, height: 300 },
    bar: { x: 760, y: 380, width: 200, height: 120 },
    bartender: { x: 660, y: 300, width: 80, height: 220 },
    busker: { x: 360, y: 300, width: 80, height: 220 },
  },
};
