import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SaveGame, SaveStore } from '../../src/save';
import { initTitleScreen } from '../../src/title';

class MemoryStore implements SaveStore {
  constructor(public game: SaveGame | null = null) {}
  async hasSave() {
    return this.game !== null;
  }
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

  it('shows Continue when a save exists and resumes its room', async () => {
    const start = vi.fn();
    const store = new MemoryStore({ version: 1, room: 'pub-interior', savedAt: 'x' });
    await initTitleScreen(document, { store, start });
    expect(btn('continue').hidden).toBe(false);
    btn('continue').click();
    await flush();
    expect(start).toHaveBeenCalledWith('pub-interior');
    expect(document.querySelector<HTMLElement>('#title-screen')!.hidden).toBe(true);
  });

  it('New game starts from the opening scene', async () => {
    const start = vi.fn();
    await initTitleScreen(document, { store: new MemoryStore(), start });
    btn('new-game').click();
    await flush();
    expect(start).toHaveBeenCalledWith();
  });
});
