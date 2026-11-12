import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SaveGame } from '../../src/domain';
import type { SaveStore } from '../../src/services/save';
import { initTitleScreen, type OwnerSignIn } from '../../src/app/title';
import type { OwnerStatus } from '../../src/services/owner';

class MemoryStore implements SaveStore {
  constructor(public game: SaveGame | null = null) {}
  async load() {
    return this.game;
  }
  async save(game: SaveGame) {
    this.game = game;
  }
  async clear() {
    this.game = null;
  }
}

function markup() {
  document.body.innerHTML = `
    <section id="title-screen"><h1>Tune Story</h1>
      <button id="continue" hidden>Continue</button>
      <button id="new-game">New game</button>
      <button id="owner-sign-in" hidden>Owner sign-in</button>
      <button id="owner-sign-out" hidden>Owner sign-out</button>
    </section>`;
}

const btn = (id: string) => document.querySelector<HTMLButtonElement>(`#${id}`)!;
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('title screen', () => {
  beforeEach(markup);

  it('hides Continue when there is no save', async () => {
    await initTitleScreen(document, { store: new MemoryStore(), start: vi.fn() });
    expect(btn('continue').hidden).toBe(true);
    expect(btn('new-game').hidden).toBe(false);
  });

  it('shows Continue when a save exists and resumes it', async () => {
    const start = vi.fn();
    const save: SaveGame = { version: 1, room: 'pub-interior', savedAt: 'x' };
    const store = new MemoryStore(save);
    await initTitleScreen(document, { store, start });
    expect(btn('continue').hidden).toBe(false);
    btn('continue').click();
    await flush();
    expect(start).toHaveBeenCalledWith(save);
    expect(document.querySelector<HTMLElement>('#title-screen')!.hidden).toBe(true);
  });

  it('Continue resumes the save it showed, even when the store can no longer read it', async () => {
    const start = vi.fn();
    const save: SaveGame = { version: 1, room: 'pub-interior', savedAt: 'x' };
    const store = new MemoryStore(save);
    await initTitleScreen(document, { store, start });
    store.load = async () => null;
    btn('continue').click();
    await flush();
    expect(start).toHaveBeenCalledWith(save);
  });

  it('New game starts from the opening scene', async () => {
    const start = vi.fn();
    await initTitleScreen(document, { store: new MemoryStore(), start });
    btn('new-game').click();
    await flush();
    expect(start).toHaveBeenCalledWith();
  });

  describe('owner sign-in', () => {
    const owner = (status: OwnerStatus): OwnerSignIn => ({
      status: Promise.resolve(status),
      signIn: vi.fn(),
      signOut: vi.fn(async () => true),
    });

    it('offers nothing without owner sign-in or a client id', async () => {
      await initTitleScreen(document, { store: new MemoryStore(), start: vi.fn() });
      await initTitleScreen(document, {
        store: new MemoryStore(),
        start: vi.fn(),
        owner: owner({ owner: false, googleClientId: null }),
      });
      await flush();
      expect(btn('owner-sign-in').hidden).toBe(true);
      expect(btn('owner-sign-out').hidden).toBe(true);
    });

    it('offers sign-in when the backend has a client id, and signs in with it', async () => {
      const deps = owner({ owner: false, googleClientId: 'client-1' });
      await initTitleScreen(document, { store: new MemoryStore(), start: vi.fn(), owner: deps });
      await flush();
      expect(btn('owner-sign-in').hidden).toBe(false);
      expect(btn('owner-sign-out').hidden).toBe(true);
      btn('owner-sign-in').click();
      expect(deps.signIn).toHaveBeenCalledWith('client-1');
    });

    it('offers the owner sign-out, and sign-in again once signed out', async () => {
      const deps = owner({ owner: true, googleClientId: 'client-1' });
      await initTitleScreen(document, { store: new MemoryStore(), start: vi.fn(), owner: deps });
      await flush();
      expect(btn('owner-sign-in').hidden).toBe(true);
      expect(btn('owner-sign-out').hidden).toBe(false);
      btn('owner-sign-out').click();
      await flush();
      expect(deps.signOut).toHaveBeenCalled();
      expect(btn('owner-sign-out').hidden).toBe(true);
      expect(btn('owner-sign-in').hidden).toBe(false);
    });

    it('keeps the owner sign-out when signing out failed', async () => {
      const deps = owner({ owner: true, googleClientId: 'client-1' });
      deps.signOut = vi.fn(async () => false);
      await initTitleScreen(document, { store: new MemoryStore(), start: vi.fn(), owner: deps });
      await flush();
      btn('owner-sign-out').click();
      await flush();
      expect(btn('owner-sign-out').hidden).toBe(false);
      expect(btn('owner-sign-in').hidden).toBe(true);
    });

    it('does not hold up Continue while the backend is slow to answer', async () => {
      const save: SaveGame = { version: 1, room: 'pub-interior', savedAt: 'x' };
      const deps: OwnerSignIn = { status: new Promise(() => {}), signIn: vi.fn(), signOut: vi.fn() };
      await initTitleScreen(document, { store: new MemoryStore(save), start: vi.fn(), owner: deps });
      expect(btn('continue').hidden).toBe(false);
    });
  });
});
