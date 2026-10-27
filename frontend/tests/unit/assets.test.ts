import { describe, expect, it } from 'vitest';
import { validateAssets } from '../../src/assets/validate';
import { loadContent } from '../../src/content';
import registryFile from '../../src/assets/models.json';
import { modelFiles } from './support/files';

// The model registry (docs/ARCHITECTURE.md, section 6) checked against the content and the model
// files: each problem names the file and the field it is in.

const content = loadContent();
type Content = typeof content;

function hotspotIn(rooms: Content['rooms'], room: string, id: string) {
  return rooms[room]!.hotspots.find((h) => h.id === id)!;
}

type Json = Record<string, any>;

/** models.json, with `edit` applied to a copy of the entry `id`. */
function broken(id: string, edit: (model: Json) => void): Json {
  const copy = structuredClone(registryFile) as Json;
  edit(copy.models.find((model: Json) => model.id === id));
  return copy;
}

describe('the model registry', () => {
  it('passes today’s models, content and model files', () => {
    expect(validateAssets(registryFile, content, modelFiles)).toEqual([]);
  });

  it.each<{
    problem: string;
    registry: Json;
    files?: Record<string, Uint8Array>;
    file: string;
    field: string;
    message: RegExp;
  }>([
    {
      problem: 'a duplicate id',
      registry: broken('object/flyer', (model) => (model.id = 'character/bartender')),
      file: 'assets/models.json',
      field: 'models[6].id',
      message: /another model/,
    },
    {
      problem: 'an unknown kind',
      registry: broken('object/flyer', (model) => (model.kind = 'prop')),
      file: 'assets/models.json',
      field: 'models[6].kind',
      message: /must be scene, character or object/,
    },
    {
      problem: 'a missing model',
      registry: broken('object/flyer', (model) => (model.id = 'object/poster')),
      file: 'content/objects.json',
      field: 'objects[id=flyer].model',
      message: /"object\/flyer" is not in the model registry/,
    },
    {
      problem: 'a model of the wrong kind',
      registry: broken('character/bartender', (model) => (model.kind = 'object')),
      file: 'content/characters.json',
      field: 'characters[id=bartender].model',
      message: /is a object, not a character/,
    },
    {
      problem: 'a room model that is not a scene',
      registry: broken('scene/pub', (model) => (model.kind = 'object')),
      file: 'content/rooms/pub.json',
      field: 'model',
      message: /is a object, not a scene/,
    },
    {
      problem: 'a model with no model file',
      registry: broken('object/broken-guitar', (model) => delete model.model3d),
      file: 'assets/models.json',
      field: 'models[7].model3d',
      message: /must be an object/,
    },
    {
      problem: 'a model file not named after its id',
      registry: broken('object/flyer', (model) => (model.model3d.file = 'models/objects/Flyer.glb')),
      file: 'assets/models.json',
      field: 'models[id=object/flyer].model3d.file',
      message: /must be "models\/objects\/flyer.glb"/,
    },
    {
      problem: 'a missing model file',
      registry: registryFile,
      files: Object.fromEntries(Object.entries(modelFiles).filter(([path]) => !path.endsWith('broken-guitar.glb'))),
      file: 'assets/models.json',
      field: 'models[id=object/broken-guitar].model3d.file',
      message: /"models\/objects\/broken-guitar.glb" is not under public/,
    },
    {
      problem: 'a model file that breaks the asset contract',
      registry: registryFile,
      files: { ...modelFiles, 'models/characters/bartender.glb': modelFiles['models/objects/flyer.glb']! },
      file: 'public/models/characters/bartender.glb',
      field: 'nodes: anchor_head',
      message: /has no node "anchor_head"/,
    },
    {
      problem: "a character far from the registry's height",
      registry: broken('character/protagonist', (model) => (model.model3d.height = 2.5)),
      file: 'public/models/characters/protagonist.glb',
      field: 'origin: height',
      message: /the registry says about 2.5 m/,
    },
  ])('reports $problem by file and field', ({ registry, files = modelFiles, file, field, message }) => {
    expect(validateAssets(registry, content, files)).toContainEqual({
      file,
      field,
      message: expect.stringMatching(message),
    });
  });

  it("reports a scene file without the hit node of one of its room's parts", () => {
    const files = { ...modelFiles, 'models/scenes/opening.glb': modelFiles['models/scenes/pub.glb']! };
    expect(validateAssets(registryFile, content, files)).toContainEqual({
      file: 'public/models/scenes/opening.glb',
      field: 'nodes: hit_board',
      message: expect.stringMatching(/no node "hit_board" for the hotspot "board" of content\/rooms\/opening.json/),
    });
  });

  it.each<{ point: string; edit: (rooms: Content['rooms']) => void; file: string; field: string }>([
    { point: 'a start', edit: (rooms) => (rooms.feed!.start = { x: 640, y: 200 }), file: 'feed', field: 'start' },
    {
      point: 'a corner of the floor',
      edit: (rooms) => (rooms.dream!.walkable[1] = { x: 1170, y: 300 }),
      file: 'dream',
      field: 'walkable[1]',
    },
    {
      point: 'where an entity stands',
      edit: (rooms) => Object.assign(hotspotIn(rooms, 'pub', 'bartender').target, { at: { x: 1010, y: 100 } }),
      file: 'pub',
      field: 'hotspots[id=bartender].target.at',
    },
    {
      point: 'an exit into the room',
      edit: (rooms) => Object.assign(hotspotIn(rooms, 'pub', 'door').interactions[0]!.effects[0]!, { at: { x: 705, y: 150 } }),
      file: 'pub',
      field: 'hotspots[id=door].interactions[0].effects[0].at',
    },
  ])("reports $point that misses the floor of the room's scene file", ({ edit, file, field }) => {
    const given = structuredClone(content) as Content;
    edit(given.rooms);
    expect(validateAssets(registryFile, given, modelFiles)).toEqual([
      { file: `content/rooms/${file}.json`, field, message: expect.stringMatching(/does not land on the "floor" of public\/models\/scenes\//) },
    ]);
  });
});
