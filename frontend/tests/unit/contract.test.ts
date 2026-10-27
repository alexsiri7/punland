import { describe, expect, it } from 'vitest';
import { checkModel } from '../../src/assets/contract';
import type { ModelKind } from '../../src/assets/registry';
import { CHARACTER, fixtures, glb, type Model, scene } from '../fixtures/models/glb';

// The rules of the asset contract (docs/ARCHITECTURE.md, section 8) beyond the ones the models
// spec's acceptance test names (models.acceptance.test.ts): each case breaks one rule.

const OBJECT: Model = {
  boxes: [{ name: 'crate', from: [-0.2, 0, -0.2], size: [0.4, 0.4, 0.4], color: '#8A5A34', material: 'wood' }],
};

/** `model` with every box moved by `by`. */
function moved(model: Model, by: [number, number, number], which = (_: string) => true): Model {
  const boxes = model.boxes.map((box) =>
    which(box.name) ? { ...box, from: box.from.map((v, i) => v + by[i]!) as [number, number, number] } : box,
  );
  return { ...model, boxes };
}

function withoutCamera({ camera: _, ...model }: Model): Model {
  return model;
}

/** The character fixture's bytes with the 32-bit word at `offset` set to `word`. */
function patched(offset: number, word: number): Uint8Array {
  const bytes = fixtures.character();
  new DataView(bytes.buffer).setUint32(offset, word, true);
  return bytes;
}

describe('the asset contract', () => {
  it.each<{ rule: string; kind: ModelKind; model: Model }>([
    { rule: 'format: glTF 2.0', kind: 'character', model: { ...CHARACTER, version: '1.0' } },
    {
      rule: 'format: extensionsRequired',
      kind: 'character',
      model: { ...CHARACTER, extensionsRequired: ['KHR_materials_unlit'] },
    },
    {
      rule: 'format: EXT_meshopt_compression',
      kind: 'character',
      model: { ...CHARACTER, extensions: ['EXT_meshopt_compression'] },
    },
    { rule: 'format: KHR_texture_basisu', kind: 'object', model: { ...OBJECT, extensions: ['KHR_texture_basisu'] } },
    { rule: 'nodes: floor', kind: 'scene', model: { ...scene(), boxes: scene().boxes.filter((b) => b.name !== 'floor') } },
    { rule: 'nodes: cam_main', kind: 'scene', model: withoutCamera(scene()) },
    {
      rule: 'nodes: cam_main',
      kind: 'scene',
      model: { ...scene(), camera: { name: 'cam_main', at: [0, 1.6, 4], type: 'orthographic' } },
    },
    { rule: 'animations: idle', kind: 'character', model: { ...CHARACTER, clips: ['walk'] } },
    { rule: 'animations: names', kind: 'character', model: { ...CHARACTER, clips: ['idle', 'walk', 'Talk'] } },
    { rule: 'budget: triangles', kind: 'object', model: { ...OBJECT, bulk: 2_001 } },
    { rule: 'budget: joints', kind: 'character', model: { ...CHARACTER, joints: 65 } },
    { rule: 'budget: bytes', kind: 'character', model: { ...CHARACTER, filler: 1_500_001 } },
    { rule: 'budget: bytes', kind: 'object', model: { ...OBJECT, filler: 300_001 } },
    { rule: 'budget: joint influences', kind: 'character', model: { ...CHARACTER, influences: 8 } },
    {
      rule: 'units: scale',
      kind: 'object',
      model: { ...OBJECT, boxes: [{ ...OBJECT.boxes[0]!, size: [0.2, 0.2, 0.2], scale: [2, 2, 2] }] },
    },
    {
      rule: 'units: scale',
      kind: 'object',
      model: { ...OBJECT, boxes: [{ ...OBJECT.boxes[0]!, scale: [-1, 1, 1] }] },
    },
    { rule: 'origin: base', kind: 'character', model: moved(CHARACTER, [0, 0.5, 0]) },
    { rule: 'origin: base', kind: 'object', model: moved(OBJECT, [1, 0, 0]) },
    { rule: 'origin: bounds', kind: 'object', model: { ...OBJECT, boxes: [] } },
    { rule: 'origin: floor', kind: 'scene', model: moved(scene(), [0, 0.5, 0], (name) => name === 'floor') },
    { rule: 'origin: scene', kind: 'scene', model: moved(scene(), [0, 0, -1], (name) => name === 'floor') },
  ])('reports a $kind that breaks "$rule"', ({ rule, kind, model }) => {
    expect(checkModel(glb(model), kind, 'models/broken.glb')).toContainEqual({
      file: 'models/broken.glb',
      rule,
      message: expect.any(String),
    });
  });

  it('passes a valid object', () => {
    expect(checkModel(glb(OBJECT), 'object', 'models/objects/crate.glb')).toEqual([]);
  });

  it.each([
    { problem: 'a file too short to be glb', bytes: () => new Uint8Array(12), message: /is not a glb file/ },
    { problem: 'a wrong magic number', bytes: () => patched(0, 0x12345678), message: /is not a glb file/ },
    { problem: 'a glb container version 1', bytes: () => patched(4, 1), message: /container version 1, not 2/ },
    { problem: 'a truncated file', bytes: () => fixtures.character().slice(0, -4), message: /bytes long, but is/ },
    { problem: 'a first chunk that is not JSON', bytes: () => patched(16, 0x004e4942), message: /JSON chunk/ },
    { problem: 'a JSON chunk longer than the file', bytes: () => patched(12, 0xffffff), message: /JSON chunk/ },
    {
      problem: 'a JSON chunk that does not parse',
      bytes: () => {
        const bytes = fixtures.character();
        bytes[20] = 0x7d;
        return bytes;
      },
      message: /not JSON/,
    },
  ])('reports $problem as "format: glb"', ({ bytes, message }) => {
    expect(checkModel(bytes(), 'character', 'models/broken.glb')).toEqual([
      { file: 'models/broken.glb', rule: 'format: glb', message: expect.stringMatching(message) },
    ]);
  });
});
