import { describe, expect, it } from 'vitest';
import { breaches, fixtures } from '../fixtures/models/glb';
import { type Content, load } from './support/modules';

// Acceptance tests for openspec/specs/models/spec.md that are about the code, not what the
// player sees: the model registry and the asset contract (docs/ARCHITECTURE.md, sections 6
// and 8). The rest are e2e tests in tests/e2e/models.spec.ts.

/** The models a room places through its hotspots' entities. */
function placedModels(content: Content, room: string): string[] {
  return (content.rooms[room]?.hotspots ?? []).flatMap(({ target }) => {
    if (!target || !('entity' in target)) return [];
    const entity = content.objects[target.entity] ?? content.characters[target.entity];
    return entity ? [entity.model] : [];
  });
}

describe('One model per entity', () => {
  // Requirement: One model per entity. Each entity has exactly one registry entry, and content
  // refers to models only by that entry's id, so a model is reused in every room it appears in.
  it('The same model in two rooms', async () => {
    const [{ loadContent }, { models }] = await Promise.all([load('content'), load('assets')]);
    const content = loadContent();
    expect(placedModels(content, 'opening')).toContain('object/flyer');
    expect(placedModels(content, 'dream')).toContain('object/flyer');
    expect(Object.entries(models).filter(([id]) => id === 'object/flyer')).toEqual([
      ['object/flyer', expect.objectContaining({ kind: 'object' })],
    ]);
  });
});

describe('Asset contract', () => {
  // Requirement: Asset contract. A model file that breaks the contract (a missing node or
  // animation, a forbidden glTF extension, a texture, over its budget) fails the unit tests,
  // naming the file and the rule it breaks.
  it('A model that breaks the contract', async () => {
    const { checkModel } = await load('contract');
    expect(checkModel(fixtures.character(), 'character', 'characters/valid.glb')).toEqual([]);
    expect(checkModel(fixtures.scene(), 'scene', 'scenes/valid.glb')).toEqual([]);
    expect(checkModel(fixtures.magentaScene(), 'scene', 'scenes/magenta.glb')).toEqual([]);
    for (const breach of breaches) {
      expect(checkModel(breach.glb(), 'character', breach.file), breach.file).toContainEqual({
        file: breach.file,
        rule: expect.stringMatching(breach.rule),
        message: expect.any(String),
      });
    }
  });
});
