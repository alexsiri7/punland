import { describe, expect, it } from 'vitest';
import { load, play } from './support/modules';

// Acceptance tests for openspec/specs/architecture/spec.md, requirement "Serialisable game
// state". The save format is in docs/ARCHITECTURE.md, section 3.

/** A save as the game writes it before spec change #25 (SaveGame in src/services/save.ts). */
const V1_SAVE = {
  version: 1,
  room: 'pub',
  savedAt: '2026-10-24T12:00:00.000Z',
  inventory: { items: ['broken-guitar', 'flyer'], pickedUp: ['flyer'] },
  journey: { left: { street: { room: 'pub', at: { x: 300, y: 580 } } }, gathered: ['open-mic'] },
};

describe('Serialisable game state', () => {
  // Requirement: Serialisable game state. The game state is plain data: a saved state that is
  // loaded again equals the one that was saved.
  it('Saving and restoring', async () => {
    const [{ loadContent }, { newGame }, { toSave, fromSave }] = await Promise.all([
      load('content'),
      load('domain'),
      load('save'),
    ]);
    const content = loadContent();
    const { state } = await play(content, newGame(content), [
      { type: 'activate', hotspot: 'flyer' },
      { type: 'activate', hotspot: 'door' },
    ]);
    expect(state.room).toBe('pub');
    const restored = fromSave(JSON.parse(JSON.stringify(toSave(state))), content);
    expect(restored).toEqual({ ...state, selected: null, walk: null, saying: null });
  });

  // Requirement: Serialisable game state. Saves made by earlier versions of the game still load.
  it('An older save', async () => {
    const [{ loadContent }, { fromSave }] = await Promise.all([load('content'), load('save')]);
    const state = fromSave(V1_SAVE, loadContent());
    expect(state.room).toBe('pub');
    expect(state.inventory).toEqual({ carried: ['broken-guitar', 'flyer'], pickedUp: ['flyer'] });
    expect(state.journey).toEqual(V1_SAVE.journey);
  });
});
