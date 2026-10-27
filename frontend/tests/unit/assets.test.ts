import { describe, expect, it } from 'vitest';
import { actorOf, hotspotRect, sceneSprite } from '../../src/assets/registry';
import { validateAssets } from '../../src/assets/validate';
import { loadContent } from '../../src/content';
import type { FloorPoint } from '../../src/domain';
import registryFile from '../../src/assets/models.json';
import { modelFiles } from './support/files';

// The model registry (docs/ARCHITECTURE.md, section 6) checked against the content and the room
// art: each problem names the file and the field it is in.

/** The room art under public/, by its path there; the layer fields RoomScene reads. */
const art = Object.fromEntries(
  Object.entries(
    import.meta.glob<{ layers: { actor?: string; foot?: FloorPoint }[] }>('/public/rooms/*/art.json', {
      eager: true,
      import: 'default',
    }),
  ).map(([path, data]) => [path.replace(/^\/public\//, ''), data]),
);

const content = loadContent();

type Json = Record<string, any>;

/** models.json, with `edit` applied to a copy of the entry `id`. */
function broken(id: string, edit: (model: Json) => void): Json {
  const copy = structuredClone(registryFile) as Json;
  edit(copy.models.find((model: Json) => model.id === id));
  return copy;
}

describe('the model registry', () => {
  it('passes today’s models, content and art', () => {
    expect(validateAssets(registryFile, content, art, modelFiles)).toEqual([]);
  });

  it('has the protagonist in every room, standing on their feet', () => {
    const actor = actorOf(content.protagonist.model);
    for (const [id, room] of Object.entries(content.rooms)) {
      const layers = art[sceneSprite(room.model)?.layers ?? '']?.layers ?? [];
      expect(layers.find((layer) => layer.actor === actor)?.foot, id).toEqual({
        x: expect.any(Number),
        y: expect.any(Number),
      });
    }
  });

  it("gives each hotspot its rect from its room's scene model", () => {
    expect(hotspotRect('scene/opening', 'door')).toEqual({ x: 634, y: 208, width: 142, height: 312 });
    expect(hotspotRect('scene/opening', 'stage')).toBeNull();
    expect(hotspotRect('object/flyer', 'flyer')).toBeNull();
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
      problem: 'a rect out of the scene',
      registry: broken('scene/opening', (model) => (model.sprite2d.hotspots.board.x = 1200)),
      file: 'assets/models.json',
      field: 'models[0].sprite2d.hotspots.board',
      message: /inside the 1280 × 640 scene/,
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
      registry: broken('scene/pub', (model) => {
        model.kind = 'object';
        model.sprite2d = { actor: 'pub' };
      }),
      file: 'content/rooms/pub.json',
      field: 'model',
      message: /is a object, not a scene/,
    },
    {
      problem: 'a missing art file',
      registry: broken('scene/feed', (model) => (model.sprite2d.layers = 'rooms/feeds/art.json')),
      file: 'assets/models.json',
      field: 'models[id=scene/feed].sprite2d.layers',
      message: /"rooms\/feeds\/art.json" is not room art/,
    },
    {
      problem: 'an actor that is not in the art',
      registry: broken('object/flyer', (model) => (model.sprite2d.actor = 'poster')),
      file: 'public/rooms/opening/art.json',
      field: 'layers',
      message: /no actor "poster" for the hotspot "flyer"/,
    },
    {
      problem: 'a protagonist that is not in the art',
      registry: broken('character/protagonist', (model) => (model.sprite2d.actor = 'dog')),
      file: 'public/rooms/feed/art.json',
      field: 'layers',
      message: /no actor "dog" for the protagonist/,
    },
    {
      problem: 'a hotspot without a rect',
      registry: broken('scene/opening', (model) => delete model.sprite2d.hotspots.door),
      file: 'assets/models.json',
      field: 'models[id=scene/opening].sprite2d.hotspots',
      message: /no rect for "door"/,
    },
    {
      problem: 'a placed object with no 2D variant',
      registry: broken('object/flyer', (model) => delete model.sprite2d),
      file: 'assets/models.json',
      field: 'models[id=object/flyer].sprite2d',
      message: /is needed to draw the hotspot "flyer"/,
    },
    {
      problem: 'a model with no variant',
      registry: broken('object/broken-guitar', (model) => delete model.model3d),
      file: 'assets/models.json',
      field: 'models[7]',
      message: /must have a sprite2d, a model3d or both/,
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
    expect(validateAssets(registry, content, art, files)).toContainEqual({
      file,
      field,
      message: expect.stringMatching(message),
    });
  });

  it('reports a part of the scene that comes and goes, which the 2D art cannot show or hide', () => {
    const given = structuredClone(content);
    given.rooms.opening!.hotspots.find((h) => h.id === 'door')!.presentWhen = [{ flag: 'lit' }];
    expect(validateAssets(registryFile, given, art, modelFiles)).toEqual([
      {
        file: 'content/rooms/opening.json',
        field: 'hotspots[id=door].presentWhen',
        message: expect.stringMatching(/no actor to show or hide it/),
      },
    ]);
  });
});
