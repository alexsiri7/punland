import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SaveGame } from '../../src/domain';
import type { SaveStore } from '../../src/services/save';
import { initTitleScreen, refuseGame } from '../../src/app/title';

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
      <div id="title-problem" role="alert" hidden></div>
    </section>`;
}

const btn = (id: string) => document.querySelector<HTMLButtonElement>(`#${id}`)!;
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('title screen', () => {
  beforeEach(markup);

  it('hides Continue when there is no save', async () => {
    await initTitleScreen(document, { store: new MemoryStore(), game: 'tune-story', start: vi.fn() });
    expect(btn('continue').hidden).toBe(true);
    expect(btn('new-game').hidden).toBe(false);
  });

  it('shows Continue when a save exists and resumes it', async () => {
    const start = vi.fn();
    const save: SaveGame = { version: 1, room: 'pub-interior', savedAt: 'x' };
    const store = new MemoryStore(save);
    await initTitleScreen(document, { store, game: 'tune-story', start });
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
    await initTitleScreen(document, { store, game: 'tune-story', start });
    store.load = async () => null;
    btn('continue').click();
    await flush();
    expect(start).toHaveBeenCalledWith(save);
  });

  it('New game starts from the opening scene', async () => {
    const start = vi.fn();
    await initTitleScreen(document, { store: new MemoryStore(), game: 'tune-story', start });
    btn('new-game').click();
    await flush();
    expect(start).toHaveBeenCalledWith();
  });

  it('New game starts the game while the save is still loading', async () => {
    const start = vi.fn();
    const store = new MemoryStore();
    store.load = () => new Promise(() => {});
    void initTitleScreen(document, { store, game: 'tune-story', start });
    btn('new-game').click();
    await flush();
    expect(start).toHaveBeenCalledWith();
    expect(document.querySelector<HTMLElement>('#title-screen')!.hidden).toBe(true);
    expect(btn('continue').hidden).toBe(true);
  });

  it('does not continue a save made for another game, and says so', async () => {
    const start = vi.fn();
    const save: SaveGame = { version: 1, room: 'high-street', savedAt: 'x', gameId: 'another-game' };
    await initTitleScreen(document, { store: new MemoryStore(save), game: 'tune-story', start });
    expect(btn('continue').hidden).toBe(true);
    const problem = document.querySelector<HTMLElement>('#title-problem')!;
    expect(problem.hidden).toBe(false);
    expect(problem.textContent).toContain('another game (another-game)');
  });

  it('lists why a game is refused', () => {
    refuseGame(document, ['manifest.json schemaVersion: is 2.0', '<b>not markup</b>']);
    const problem = document.querySelector<HTMLElement>('#title-problem')!;
    expect(problem.hidden).toBe(false);
    expect([...problem.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'manifest.json schemaVersion: is 2.0',
      '<b>not markup</b>',
    ]);
  });
});
