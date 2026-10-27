import { describe, expect, it } from 'vitest';
import { type ContentFiles, loadContent, validateContent } from '../../src/content';

// Content is checked as it loads (architecture spec, "Validated content"): each problem names
// the file and the field it is in.

const files: ContentFiles = Object.fromEntries(
  Object.entries(import.meta.glob('/src/content/**/*.json', { eager: true, import: 'default' })).map(
    ([path, data]) => [path.replace(/^\/src\//, ''), data],
  ),
);

type Json = Record<string, any>;

/** The real content files, with `edit` applied to a copy of the one at `path`. */
function broken(path: string, edit: (file: Json) => void): ContentFiles {
  const copy = structuredClone(files);
  edit(copy[path] as Json);
  return copy;
}

const WORLDS = 'content/worlds.json';
const ITEMS = 'content/items.json';
const OPENING = 'content/rooms/opening.json';
const PUB = 'content/rooms/pub.json';
const CHARACTERS = 'content/characters.json';
const OBJECTS = 'content/objects.json';
const hotspot = (room: Json, id: string): Json => room.hotspots.find((h: Json) => h.id === id);

describe('content validation', () => {
  it('passes today’s content', () => {
    expect(validateContent(files)).toEqual([]);
    expect(loadContent().start).toEqual({ room: 'opening', items: ['broken-guitar'] });
  });

  it.each<{ problem: string; file: string; edit: (file: Json) => void; field: string; message: RegExp }>([
    {
      problem: 'an unknown room in an exit',
      file: OPENING,
      edit: (room) => (hotspot(room, 'door').interactions[0].effects[0].goTo = 'cellar'),
      field: 'hotspots[0].interactions[0].effects[0].goTo',
      message: /"cellar" is not a known room/,
    },
    {
      problem: 'a missing name',
      file: PUB,
      edit: (room) => delete hotspot(room, 'bartender').name,
      field: 'hotspots[1].name',
      message: /is missing/,
    },
    {
      problem: 'an unknown item to use',
      file: PUB,
      edit: (room) => (hotspot(room, 'bartender').interactions[1].item = 'kazoo'),
      field: 'hotspots[1].interactions[1].item',
      message: /"kazoo" is not a known item/,
    },
    {
      problem: 'a duplicate hotspot id',
      file: OPENING,
      edit: (room) => (hotspot(room, 'board').id = 'door'),
      field: 'hotspots[1].id',
      message: /another hotspot/,
    },
    {
      problem: 'a missing hotspot id',
      file: OPENING,
      edit: (room) => delete hotspot(room, 'board').id,
      field: 'hotspots[1].id',
      message: /is missing/,
    },
    {
      problem: 'an unknown item in a pickup',
      file: OPENING,
      edit: (room) => (hotspot(room, 'flyer').interactions[0].effects[1].pickUp = 'kazoo'),
      field: 'hotspots[2].interactions[0].effects[1].pickUp',
      message: /"kazoo" is not a known item/,
    },
    {
      problem: 'a walkTo off the floor',
      file: OPENING,
      edit: (room) => (hotspot(room, 'board').walkTo = { x: 100, y: 100 }),
      field: 'hotspots[1].walkTo',
      message: /floor/,
    },
    {
      problem: 'a start off the floor',
      file: OPENING,
      edit: (room) => (room.start = { x: 0, y: 0 }),
      field: 'start',
      message: /floor/,
    },
    {
      problem: 'an exit onto no floor',
      file: PUB,
      edit: (room) => (hotspot(room, 'door').interactions[0].effects[0].at = { x: 0, y: 0 }),
      field: 'hotspots[0].interactions[0].effects[0].at',
      message: /floor of "opening"/,
    },
    {
      problem: 'a floor that is not convex',
      file: OPENING,
      edit: (room) => room.walkable.splice(2, 0, { x: 800, y: 560 }),
      field: 'walkable',
      message: /convex/,
    },
    {
      problem: 'a rect out of the scene',
      file: OPENING,
      edit: (room) => (hotspot(room, 'board').rect.x = 1200),
      field: 'hotspots[1].rect',
      message: /inside the 1280 × 640 scene/,
    },
    {
      problem: 'an unknown effect',
      file: OPENING,
      edit: (room) => (hotspot(room, 'board').interactions[0].effects[0] = { dance: 'now' }),
      field: 'hotspots[1].interactions[0].effects[0]',
      message: /must have exactly one of say, goTo/,
    },
    {
      problem: 'an unknown verb',
      file: OPENING,
      edit: (room) => (hotspot(room, 'board').interactions[0].verb = 'dance'),
      field: 'hotspots[1].interactions[0].verb',
      message: /must be look, use/,
    },
    {
      problem: 'an item with a verb other than use',
      file: OPENING,
      edit: (room) => (hotspot(room, 'board').interactions[0].item = 'flyer'),
      field: 'hotspots[1].interactions[0].item',
      message: /only with the use verb/,
    },
    {
      problem: 'a talk with an unknown character',
      file: PUB,
      edit: (room) => (hotspot(room, 'bartender').interactions[0].effects[0].talk = 'bouncer'),
      field: 'hotspots[1].interactions[0].effects[0].talk',
      message: /"bouncer" is not a known character/,
    },
    {
      problem: 'an unknown entity',
      file: OPENING,
      edit: (room) => (hotspot(room, 'flyer').target.entity = 'kazoo'),
      field: 'hotspots[2].target.entity',
      message: /"kazoo" is not a known character or object/,
    },
    {
      problem: 'an entity placed off the floor',
      file: OPENING,
      edit: (room) => (hotspot(room, 'flyer').target.at = { x: 0, y: 0 }),
      field: 'hotspots[2].target.at',
      message: /floor/,
    },
    {
      problem: 'an unknown item in a condition',
      file: OPENING,
      edit: (room) => (hotspot(room, 'flyer').presentWhen[0].not.pickedUp = 'kazoo'),
      field: 'hotspots[2].presentWhen[0].not.pickedUp',
      message: /"kazoo" is not a known item/,
    },
    {
      problem: 'a character without a name',
      file: CHARACTERS,
      edit: (file) => delete file.characters[0].name,
      field: 'characters[0].name',
      message: /is missing/,
    },
    {
      problem: 'an object without a model',
      file: OBJECTS,
      edit: (file) => delete file.objects[0].model,
      field: 'objects[0].model',
      message: /is missing/,
    },
    {
      problem: 'an exit into another world',
      file: OPENING,
      edit: (room) => (hotspot(room, 'door').interactions[0].effects[0].goTo = 'feed'),
      field: 'hotspots[0].interactions[0].effects[0].goTo',
      message: /another world/,
    },
    {
      problem: 'an unknown world',
      file: OPENING,
      edit: (room) => (room.world = 'moon'),
      field: 'world',
      message: /"moon" is not a known world/,
    },
    {
      problem: 'a world starting in another world',
      file: WORLDS,
      edit: (file) => (file.worlds[1].start = 'pub'),
      field: 'worlds[1].start',
      message: /another world/,
    },
    {
      problem: 'an unknown item to start with',
      file: ITEMS,
      edit: (file) => (file.start = ['kazoo']),
      field: 'start[0]',
      message: /"kazoo" is not a known item/,
    },
    {
      problem: 'an item without a line',
      file: ITEMS,
      edit: (file) => (file.items.flyer.noUse = ' '),
      field: 'items.flyer.noUse',
      message: /is empty/,
    },
  ])('reports $problem with its file and field', ({ file, edit, field, message }) => {
    expect(validateContent(broken(file, edit))).toEqual([{ file, field, message: expect.stringMatching(message) }]);
  });

  // A changed world id also leaves the rooms that were in that world in an unknown one.
  it.each<{ problem: string; edit: (file: Json) => void; message: RegExp }>([
    { problem: 'a duplicate world id', edit: (file) => (file.worlds[1].id = file.worlds[0].id), message: /another world/ },
    { problem: 'a world id that is not a string', edit: (file) => (file.worlds[1].id = 7), message: /must be a string/ },
  ])('reports $problem once, in worlds.json', ({ edit, message }) => {
    const issues = validateContent(broken(WORLDS, edit)).filter((issue) => issue.file === WORLDS);
    expect(issues).toEqual([{ file: WORLDS, field: 'worlds[1].id', message: expect.stringMatching(message) }]);
  });

  it('reports a missing file', () => {
    const { [ITEMS]: _, ...rest } = files;
    expect(validateContent(rest)).toContainEqual({ file: ITEMS, field: '', message: 'is missing' });
  });

  it('fails to load broken content, listing every problem', () => {
    const content = broken(OPENING, (r) => {
      delete r.label;
      hotspot(r, 'door').interactions[0].effects[0].goTo = 'cellar';
    });
    expect(() => loadContent(content)).toThrow(
      [
        "The content doesn't hold together:",
        '  content/rooms/opening.json label: is missing',
        '  content/rooms/opening.json hotspots[0].interactions[0].effects[0].goTo: "cellar" is not a known room',
      ].join('\n'),
    );
  });
});
