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
      edit: (room) => (hotspot(room, 'door').action.room = 'cellar'),
      field: 'hotspots[0].action.room',
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
      problem: 'an unknown item in uses',
      file: PUB,
      edit: (room) => (hotspot(room, 'bartender').uses[0].item = 'kazoo'),
      field: 'hotspots[1].uses[0].item',
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
      edit: (room) => (hotspot(room, 'flyer').action.item = 'kazoo'),
      field: 'hotspots[2].action.item',
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
      edit: (room) => (hotspot(room, 'door').action.at = { x: 0, y: 0 }),
      field: 'hotspots[0].action.at',
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
      problem: 'an unknown action',
      file: OPENING,
      edit: (room) => (hotspot(room, 'board').action = { type: 'dance' }),
      field: 'hotspots[1].action.type',
      message: /must be say/,
    },
    {
      problem: 'an exit into another world',
      file: OPENING,
      edit: (room) => (hotspot(room, 'door').action.room = 'feed'),
      field: 'hotspots[0].action.room',
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
      hotspot(r, 'door').action.room = 'cellar';
    });
    expect(() => loadContent(content)).toThrow(
      [
        "The content doesn't hold together:",
        '  content/rooms/opening.json label: is missing',
        '  content/rooms/opening.json hotspots[0].action.room: "cellar" is not a known room',
      ].join('\n'),
    );
  });
});
