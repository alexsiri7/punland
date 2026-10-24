import { beforeEach, describe, expect, it } from 'vitest';
import { LocalSaveStore, SAVE_KEY, type SaveGame } from '../../src/save';

const game: SaveGame = { version: 1, room: 'opening', savedAt: '2026-10-24T12:00:00.000Z' };

describe('LocalSaveStore', () => {
  beforeEach(() => localStorage.clear());

  it('has no save in a fresh browser', async () => {
    expect(await new LocalSaveStore().hasSave()).toBe(false);
  });

  it('round-trips a save', async () => {
    const store = new LocalSaveStore();
    await store.save(game);
    expect(await store.hasSave()).toBe(true);
    expect(await store.load()).toEqual(game);
  });

  it('treats malformed data as no save', async () => {
    localStorage.setItem(SAVE_KEY, '{not json');
    expect(await new LocalSaveStore().hasSave()).toBe(false);
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 99 }));
    expect(await new LocalSaveStore().hasSave()).toBe(false);
  });

  it('clears the save', async () => {
    const store = new LocalSaveStore();
    await store.save(game);
    await store.clear();
    expect(await store.hasSave()).toBe(false);
  });

  it('works without storage (blocked localStorage)', async () => {
    const store = new LocalSaveStore(null);
    await store.save(game);
    expect(await store.hasSave()).toBe(false);
  });
});
