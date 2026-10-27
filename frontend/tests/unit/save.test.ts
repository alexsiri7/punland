import { beforeEach, describe, expect, it } from 'vitest';
import type { SaveGame } from '../../src/domain';
import { BackendSaveStore, isSaveGame, LocalSaveStore, SAVE_KEY } from '../../src/services/save';

const game: SaveGame = { version: 1, room: 'opening', savedAt: '2026-10-24T12:00:00.000Z' };

describe('LocalSaveStore', () => {
  beforeEach(() => localStorage.clear());

  it('has no save in a fresh browser', async () => {
    expect(await new LocalSaveStore().load()).toBeNull();
  });

  it('round-trips a save', async () => {
    const store = new LocalSaveStore();
    await store.save(game);
    expect(await store.load()).toEqual(game);
  });

  it('treats malformed data as no save', async () => {
    localStorage.setItem(SAVE_KEY, '{not json');
    expect(await new LocalSaveStore().load()).toBeNull();
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 99 }));
    expect(await new LocalSaveStore().load()).toBeNull();
  });

  it('clears the save', async () => {
    const store = new LocalSaveStore();
    await store.save(game);
    await store.clear();
    expect(await store.load()).toBeNull();
  });

  it('works without storage (blocked localStorage)', async () => {
    const store = new LocalSaveStore(null);
    await store.save(game);
    expect(await store.load()).toBeNull();
  });
});

describe('isSaveGame', () => {
  it('accepts a save from before inventory and journey were saved', () => {
    expect(isSaveGame(game)).toBe(true);
  });

  it('accepts inventory, journey and flags, and ignores fields it does not know', () => {
    const full = {
      ...game,
      inventory: { items: ['flyer'], pickedUp: ['flyer'] },
      journey: { left: { street: { room: 'pub', at: { x: 1, y: 2 } }, dream: { room: 'dream' } }, gathered: [] },
      at: { x: 3, y: 4 },
      flags: { 'pinned-flyer': true, coins: 2, band: 'The Crows' },
      act: '2',
    };
    expect(isSaveGame(full)).toBe(true);
  });

  it('rejects a malformed spot, inventory, journey or flags', () => {
    expect(isSaveGame({ ...game, at: { x: 1 } })).toBe(false);
    expect(isSaveGame({ ...game, inventory: { items: 'flyer', pickedUp: [] } })).toBe(false);
    expect(isSaveGame({ ...game, journey: { left: { street: { at: { x: 1, y: 2 } } }, gathered: [] } })).toBe(false);
    expect(isSaveGame({ ...game, journey: { left: { street: { room: 'pub', at: 'here' } }, gathered: [] } })).toBe(false);
    expect(isSaveGame({ ...game, flags: { 'pinned-flyer': null } })).toBe(false);
    expect(isSaveGame({ ...game, flags: [true] })).toBe(false);
  });
});

describe('BackendSaveStore', () => {
  beforeEach(() => localStorage.clear());

  const older: SaveGame = { version: 1, room: 'opening', savedAt: '2026-10-24T12:00:00.000Z' };
  const newer: SaveGame = { version: 1, room: 'pub', savedAt: '2026-10-25T12:00:00.000Z' };
  const PLAYER = 'b5f1c0de-0000-4000-8000-000000000000';

  interface Call {
    method: string;
    headers: Record<string, string>;
    body?: string | undefined;
  }

  /** A backend that answers GET with `answer` and records every request. */
  function backend(answer: () => Promise<Response>) {
    const calls: Call[] = [];
    const fetch = async (_url: RequestInfo | URL, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      calls.push({ method, headers: init.headers as Record<string, string>, body: init.body as string | undefined });
      return method === 'GET' ? answer() : new Response(null, { status: 204 });
    };
    return { calls, fetch: fetch as typeof globalThis.fetch };
  }

  const json = (body: unknown) => async () => Response.json(body);
  const noSave = async () => new Response(null, { status: 204 });
  const store = (local: SaveGame | null, answer: () => Promise<Response>) => {
    if (local) localStorage.setItem(SAVE_KEY, JSON.stringify(local));
    const fake = backend(answer);
    return { ...fake, store: new BackendSaveStore(new LocalSaveStore(), { base: 'https://api', player: PLAYER, fetch: fake.fetch }) };
  };

  it('continues from the backend copy when it is newer', async () => {
    expect(await store(older, json(newer)).store.load()).toEqual(newer);
  });

  it('continues from the local copy when it is newer', async () => {
    expect(await store(newer, json(older)).store.load()).toEqual(newer);
  });

  it('continues from the backend copy in a browser without one', async () => {
    expect(await store(null, json(newer)).store.load()).toEqual(newer);
  });

  it('goes with the local copy when the backend has none, is down or answers nonsense', async () => {
    expect(await store(older, noSave).store.load()).toEqual(older);
    expect(await store(older, () => Promise.reject(new TypeError('offline'))).store.load()).toEqual(older);
    expect(await store(older, json({ status: 'ok' })).store.load()).toEqual(older);
    localStorage.clear();
    expect(await store(null, noSave).store.load()).toBeNull();
  });

  it('does not write this browser\'s copy when loading', async () => {
    const { store: s } = store(older, json(newer));
    await s.load();
    expect(JSON.parse(localStorage.getItem(SAVE_KEY)!)).toEqual(older);
  });

  it('saves locally at once and PUTs the save for this player', async () => {
    const { store: s, calls } = store(null, noSave);
    const saved = s.save(newer);
    expect(JSON.parse(localStorage.getItem(SAVE_KEY)!)).toEqual(newer);
    await saved;
    expect(calls).toEqual([
      { method: 'PUT', headers: { 'X-Player-Id': PLAYER, 'Content-Type': 'application/json' }, body: JSON.stringify(newer) },
    ]);
  });

  it('sends writes in the order the game made them', async () => {
    const { store: s, calls } = store(older, noSave);
    await s.clear();
    await s.save(newer);
    expect(calls.map((c) => c.method)).toEqual(['DELETE', 'PUT']);
    expect(localStorage.getItem(SAVE_KEY)).toBe(JSON.stringify(newer));
  });

  it('does not fail a save when the backend is down', async () => {
    const s = new BackendSaveStore(new LocalSaveStore(), {
      base: 'https://api',
      player: PLAYER,
      fetch: () => Promise.reject(new TypeError('offline')),
    });
    await expect(s.save(newer)).resolves.toBeUndefined();
    expect(await s.load()).toEqual(newer);
  });
});
