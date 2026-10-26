import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMirror } from '../../src/app/mirror';
import { GameSession } from '../../src/app/session';
import { loadContent } from '../../src/content';
import { type Command, fromSave, type GameEvent, newGame } from '../../src/domain';
import { isSaveGame, type SaveGame } from '../../src/services/save';

const content = loadContent();
const NOW = new Date('2026-10-26T12:00:00.000Z');

/** A save as the game wrote it before the session (#29): no `at`. */
const V1_SAVE: SaveGame = {
  version: 1,
  room: 'pub',
  savedAt: '2026-10-24T12:00:00.000Z',
  inventory: { items: ['broken-guitar', 'flyer'], pickedUp: ['flyer'] },
  journey: { left: { dream: { room: 'dream' } }, gathered: ['open-mic'] },
};

function session(state = newGame(content)) {
  const saves: SaveGame[] = [];
  const game = new GameSession(content, state, { save: async (save) => void saves.push(save) }, () => NOW);
  const events: GameEvent[] = [];
  game.subscribe((event) => events.push(event));
  return { game, saves, events };
}

/** Sends the command, then ticks until the walk it started is over. */
function play(game: GameSession, ...commands: Command[]): void {
  for (const command of commands) {
    game.dispatch(command);
    while (game.state.walk) game.dispatch({ type: 'tick', dtMs: 100 });
  }
}

describe('GameSession', () => {
  it('applies each command through the rules and tells listeners, with the state already changed', () => {
    const { game, events } = session();
    const seen: string[] = [];
    game.subscribe((event) => {
      if (event.type === 'pickedUp') seen.push(...game.state.inventory.carried);
    });
    play(game, { type: 'activate', hotspot: 'flyer' });
    expect(events).toContainEqual({ type: 'pickedUp', item: 'flyer', hotspot: 'flyer' });
    expect(seen).toEqual(['broken-guitar', 'flyer']);
    expect(game.isPresent(content.rooms.opening!.hotspots.find((h) => h.id === 'flyer')!)).toBe(false);
  });

  it('saves the state on every saved event, stamped with the time, in the save format', () => {
    const { game, saves } = session();
    play(game, { type: 'walk', to: { x: 900, y: 585 } });
    expect(saves).toEqual([]);
    play(game, { type: 'activate', hotspot: 'flyer' }, { type: 'activate', hotspot: 'door' });
    expect(saves).toHaveLength(2);
    expect(saves[1]).toEqual({
      version: 1,
      room: 'pub',
      at: content.rooms.pub!.start,
      savedAt: NOW.toISOString(),
      inventory: { items: ['broken-guitar', 'flyer'], pickedUp: ['flyer'] },
      journey: { left: {}, gathered: ['open-mic'] },
    });
    expect(saves.every(isSaveGame)).toBe(true);
  });

  it('continues a save made before it, and saves it back in the same format', () => {
    const { game, saves } = session(fromSave(JSON.parse(JSON.stringify(V1_SAVE)), content));
    expect(game.state.room).toBe('pub');
    expect(game.state.at).toEqual(content.rooms.pub!.start);
    play(game, { type: 'activate', hotspot: 'door' });
    expect(game.state.room).toBe('opening');
    expect(saves).toEqual([
      {
        version: 1,
        room: 'opening',
        at: { x: 705, y: 590 },
        savedAt: NOW.toISOString(),
        inventory: V1_SAVE.inventory,
        journey: V1_SAVE.journey,
      },
    ]);
  });

  it('stops telling a listener once it unsubscribes', () => {
    const { game } = session();
    const heard: GameEvent[] = [];
    const unsubscribe = game.subscribe((event) => heard.push(event));
    game.dispatch({ type: 'select', item: 'broken-guitar' });
    unsubscribe();
    game.dispatch({ type: 'select', item: null });
    expect(heard).toEqual([{ type: 'selected', item: 'broken-guitar' }]);
  });
});

describe('the #game mirror', () => {
  let container: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the room, its world and the player once the view has drawn it', () => {
    const { game } = session();
    const mirror = createMirror(container, game);
    expect(container.dataset.scene).toBeUndefined();
    mirror.shown();
    expect({ ...container.dataset }).toEqual({
      scene: 'opening',
      world: 'street',
      player: '560,590',
      hover: '',
      say: '',
    });
  });

  it('follows the player as they walk, and changes room only when the view shows the new one', () => {
    const { game } = session();
    const mirror = createMirror(container, game);
    mirror.shown();
    game.dispatch({ type: 'walk', to: { x: 900, y: 585 } });
    game.dispatch({ type: 'tick', dtMs: 100 });
    expect(container.dataset.player).toBe('592,590');
    play(game, { type: 'activate', hotspot: 'door' });
    expect(container.dataset.scene).toBe('opening');
    mirror.shown();
    expect(container.dataset.scene).toBe('pub');
    expect(container.dataset.player).toBe('250,585');
  });

  it('shows what the player says until they are hushed or the line has been up long enough', () => {
    const { game } = session();
    createMirror(container, game).shown();
    play(game, { type: 'activate', hotspot: 'board' });
    const line = content.rooms.opening!.hotspots.find((h) => h.id === 'board')!.action;
    expect(container.dataset.say).toBe(line.type === 'say' ? line.line : '');
    game.dispatch({ type: 'walk', to: { x: 900, y: 585 } });
    expect(container.dataset.say).toBe('');
    play(game, { type: 'activate', hotspot: 'board' });
    vi.advanceTimersByTime(60_000);
    expect(container.dataset.say).toBe('');
  });

  it('shows the hotspot the view says is under the pointer', () => {
    const mirror = createMirror(container, session().game);
    mirror.hover('Door');
    expect(container.dataset.hover).toBe('Door');
    mirror.hover('');
    expect(container.dataset.hover).toBe('');
  });
});
