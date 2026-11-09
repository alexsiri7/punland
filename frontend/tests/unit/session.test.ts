import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMirror } from '../../src/app/mirror';
import { GameSession } from '../../src/app/session';
import { type Command, fromSave, type GameEvent, isSaveGame, newGame, type SaveGame } from '../../src/domain';
import { speechMs } from '../../src/presentation/ui/speech';
import { content } from './fixtures/content';

const NOW = new Date('2026-10-26T12:00:00.000Z');

/** A save as the game wrote it before the session (#29): no `at`. */
const V1_SAVE: SaveGame = {
  version: 1,
  room: 'pub',
  savedAt: '2026-10-24T12:00:00.000Z',
  inventory: { items: ['guitar', 'flyer'], pickedUp: ['flyer'] },
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
    expect(seen).toEqual(['guitar', 'flyer']);
    const flyer = content.rooms.street!.hotspots.find((h) => h.id === 'flyer')!;
    expect(game.isPresent(flyer)).toBe(false);
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
      inventory: { items: ['guitar', 'flyer'], pickedUp: ['flyer'] },
      journey: { left: {}, gathered: ['open-mic'] },
      flags: {},
      act: 'one',
      goals: [],
      stats: { fame: 0, skill: 1 },
    });
    expect(saves.every(isSaveGame)).toBe(true);
  });

  it('continues a save made before it, and saves it back in the same format', () => {
    const { game, saves } = session(fromSave(JSON.parse(JSON.stringify(V1_SAVE)), content));
    expect(game.state.room).toBe('pub');
    expect(game.state.at).toEqual(content.rooms.pub!.start);
    play(game, { type: 'activate', hotspot: 'door' });
    expect(game.state.room).toBe('street');
    expect(saves).toEqual([
      {
        version: 1,
        room: 'street',
        at: { x: 510, y: 560 },
        savedAt: NOW.toISOString(),
        inventory: V1_SAVE.inventory,
        journey: V1_SAVE.journey,
        flags: {},
        act: 'one',
        goals: [],
        stats: { fame: 0, skill: 1 },
      },
    ]);
  });

  it('stops telling a listener once it unsubscribes', () => {
    const { game } = session();
    const heard: GameEvent[] = [];
    const unsubscribe = game.subscribe((event) => heard.push(event));
    game.dispatch({ type: 'select', item: 'guitar' });
    unsubscribe();
    game.dispatch({ type: 'select', item: null });
    expect(heard).toEqual([{ type: 'selected', item: 'guitar' }]);
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

  it('shows the room, its world, the player and the act once the view has drawn it', () => {
    const { game } = session();
    const mirror = createMirror(container, game);
    expect(container.dataset.scene).toBeUndefined();
    mirror.shown();
    expect({ ...container.dataset }).toEqual({
      scene: 'street',
      world: 'street',
      player: '100,550',
      hover: '',
      say: '',
      act: 'one',
      playerAnimation: 'idle',
    });
  });

  it('follows the act as it changes', () => {
    const { game } = session({ ...newGame(content), room: 'pub', goals: ['guitar'] });
    createMirror(container, game).shown();
    game.dispatch({ type: 'dialogueResult', character: 'bartender', goalReached: true });
    expect(container.dataset.act).toBe('two');
  });

  it('follows the player as they walk, and changes room only when the view shows the new one', () => {
    const { game } = session();
    const mirror = createMirror(container, game);
    mirror.shown();
    game.dispatch({ type: 'walk', to: { x: 900, y: 585 } });
    game.dispatch({ type: 'tick', dtMs: 100 });
    expect(container.dataset.player).toBe('132,551');
    play(game, { type: 'activate', hotspot: 'door' });
    expect(container.dataset.scene).toBe('street');
    mirror.shown();
    expect(container.dataset.scene).toBe('pub');
    expect(container.dataset.player).toBe('300,550');
  });

  it('shows what the player says until they are hushed or the line has been up long enough', () => {
    const { game } = session();
    createMirror(container, game).shown();
    play(game, { type: 'activate', hotspot: 'sign' });
    expect(container.dataset.say).toBe('A sign.');
    game.dispatch({ type: 'walk', to: { x: 900, y: 585 } });
    expect(container.dataset.say).toBe('');
    play(game, { type: 'activate', hotspot: 'sign' });
    vi.advanceTimersByTime(60_000);
    expect(container.dataset.say).toBe('');
  });

  it('shows the lines said one after another in turn, by anyone', () => {
    const { game } = session({ ...newGame(content), room: 'pub' });
    createMirror(container, game).shown();
    play(game, { type: 'activate', hotspot: 'busker' });
    expect(container.dataset.say).toBe('Evening.');
    vi.advanceTimersByTime(speechMs('Evening.'));
    expect(container.dataset.say).toBe('Any requests?');
    vi.advanceTimersByTime(speechMs('Any requests?'));
    expect(container.dataset.say).toBe('Not tonight.');
    vi.advanceTimersByTime(speechMs('Not tonight.'));
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
