import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ONCE_MS } from '../../src/app/animation';
import { playGame } from '../../src/app/game';
import { GameSession } from '../../src/app/session';
import { loadContent } from '../../src/content';
import { type GameState, newGame } from '../../src/domain';
import { speechMs } from '../../src/presentation/ui/speech';
import { FakeRenderer } from './fakes/renderer';

// Character animation (models spec): the app tells the renderer the clip each character plays,
// from the session's events, and mirrors the player's as data-player-animation.

const content = loadContent();

describe('character animation', () => {
  let container: HTMLElement;
  let renderer: FakeRenderer;
  let game: GameSession;

  async function start(state: GameState) {
    container?.remove();
    container = document.createElement('div');
    document.body.append(container);
    renderer = new FakeRenderer();
    game = new GameSession(content, state, { save: async () => {} });
    await playGame(container, game, renderer, { turn: () => new Promise(() => {}) });
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    await start(newGame(content));
  });

  afterEach(() => {
    container.remove();
    vi.useRealTimers();
  });

  /** Runs frames, each its own task as in a browser, until the walk is over. */
  async function walk() {
    while (game.state.walk) {
      renderer.step(100);
      await vi.advanceTimersByTimeAsync(0);
    }
  }

  /** The clips `who` was told to play, in order. */
  const played = (who = 'player') =>
    renderer.calls.flatMap((call) => (call.method === 'play' && call.who === who ? [call.clip] : []));

  it('walks while the player walks, and idles once they stop', async () => {
    expect(container.dataset.playerAnimation).toBe('idle');
    game.dispatch({ type: 'walk', to: { x: 900, y: 585 } });
    renderer.step(100);
    await vi.advanceTimersByTimeAsync(0);
    renderer.step(100);
    await vi.advanceTimersByTimeAsync(0);
    expect(played()).toEqual(['walk']);
    expect(container.dataset.playerAnimation).toBe('walk');
    await walk();
    expect(played()).toEqual(['walk', 'idle']);
    expect(container.dataset.playerAnimation).toBe('idle');
  });

  it('talks for as long as the line is up, then idles', async () => {
    game.dispatch({ type: 'activate', hotspot: 'board' });
    await walk();
    expect(container.dataset.playerAnimation).toBe('talk');
    await vi.advanceTimersByTimeAsync(speechMs(game.state.saying!.line) - 1);
    expect(container.dataset.playerAnimation).toBe('talk');
    await vi.advanceTimersByTimeAsync(1);
    expect(played()).toEqual(['walk', 'talk', 'idle']);
  });

  it('plays pickup once on picking something up, then talks while its line is up, then idles', async () => {
    await start({ ...newGame(content), room: 'high-street', at: { x: 300, y: 585 } });
    game.dispatch({ type: 'activate', hotspot: 'lesson-flyer' });
    await walk();
    expect(container.dataset.playerAnimation).toBe('pickup');
    await vi.advanceTimersByTimeAsync(ONCE_MS);
    expect(container.dataset.playerAnimation).toBe('talk');
    await vi.advanceTimersByTimeAsync(speechMs(game.state.saying!.line));
    expect(played()).toEqual(['walk', 'pickup', 'talk', 'idle']);
  });

  it('plays use once on an accepted use, then idles while a character says its line', async () => {
    await start({ ...newGame(content), room: 'pub', inventory: { carried: ['guitar'], pickedUp: [] } });
    game.dispatch({ type: 'select', item: 'guitar' });
    game.dispatch({ type: 'activate', hotspot: 'sheryl-caw' });
    await walk();
    expect(container.dataset.playerAnimation).toBe('use');
    expect(played('sheryl-caw')).toEqual(['talk']);
    await vi.advanceTimersByTimeAsync(ONCE_MS);
    expect(container.dataset.playerAnimation).toBe('idle');
    await vi.advanceTimersByTimeAsync(speechMs(game.state.saying!.line));
    expect(played('sheryl-caw')).toEqual(['talk', 'idle']);
  });

  it('has the characters and the player talk in turn, each while their line is up', async () => {
    await start({ ...newGame(content), room: 'flat' });
    game.dispatch({ type: 'activate', hotspot: 'song-master' });
    await walk();
    const said = content.rooms.flat!.hotspots
      .find((h) => h.id === 'song-master')!
      .interactions[0]!.effects.flatMap((effect) => ('say' in effect ? [effect.say] : []));
    expect(played('song-master')).toEqual(['talk']);
    expect(container.dataset.playerAnimation).toBe('idle');
    await vi.advanceTimersByTimeAsync(speechMs(said[0]!) + speechMs(said[1]!));
    expect(played('song-master')).toEqual(['talk', 'idle']);
    expect(container.dataset.playerAnimation).toBe('talk');
    await vi.advanceTimersByTimeAsync(speechMs(said[2]!));
    expect(played()).toEqual(['walk', 'idle', 'talk', 'idle']);
  });

  it('plays no use when the item is refused', async () => {
    game.dispatch({ type: 'select', item: 'broken-guitar' });
    game.dispatch({ type: 'activate', hotspot: 'board' });
    await walk();
    expect(played()).toEqual(['walk', 'talk']);
  });

  it('has a character talk in a conversation with them, until the player walks away', async () => {
    game.dispatch({ type: 'activate', hotspot: 'door' });
    await walk();
    game.dispatch({ type: 'activate', hotspot: 'bartender' });
    await walk();
    expect(played('bartender')).toEqual(['talk']);
    game.dispatch({ type: 'walk', to: { x: 600, y: 585 } });
    renderer.step(100);
    await vi.advanceTimersByTimeAsync(0);
    expect(played('bartender')).toEqual(['talk', 'idle']);
  });

  it('has a character stop talking when the player leaves the conversation', async () => {
    game.dispatch({ type: 'activate', hotspot: 'door' });
    await walk();
    game.dispatch({ type: 'activate', hotspot: 'bartender' });
    await walk();
    container.querySelector<HTMLButtonElement>('.dialogue-leave')!.click();
    expect(played('bartender')).toEqual(['talk', 'idle']);

    game.dispatch({ type: 'activate', hotspot: 'bartender' });
    await walk();
    container.querySelector('.dialogue')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(played('bartender')).toEqual(['talk', 'idle', 'talk', 'idle']);
  });
});
