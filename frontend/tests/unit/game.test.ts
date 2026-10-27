import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playGame } from '../../src/app/game';
import { GameSession } from '../../src/app/session';
import { loadContent } from '../../src/content';
import { newGame } from '../../src/domain';
import { FakeRenderer } from './fakes/renderer';

// The app plays the session through the Renderer interface (docs/ARCHITECTURE.md, section 5),
// whichever renderer draws it: here a fake one, checked through the #game mirror.

const content = loadContent();

describe('the game, drawn by a renderer', () => {
  let container: HTMLElement;
  let renderer: FakeRenderer;
  let game: GameSession;

  beforeEach(async () => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.append(container);
    renderer = new FakeRenderer();
    game = new GameSession(content, newGame(content), { save: async () => {} });
    await playGame(container, game, renderer, { turn: async () => null });
  });

  afterEach(() => {
    container.remove();
    vi.useRealTimers();
  });

  /** Runs frames until the walk is over, and lets a room the walk led to be shown. */
  async function walk() {
    while (game.state.walk) renderer.step(100);
    await vi.advanceTimersByTimeAsync(0);
  }

  const button = (name: string) =>
    container.querySelector<HTMLButtonElement>(`[aria-label="Hotspots"] button[aria-label="${name}"]`)!;
  const click = (x: number, y: number) =>
    renderer.canvas().dispatchEvent(new MouseEvent('pointerdown', { clientX: x, clientY: y }));

  it('plays opening, pub and opening again, and the mirror follows', async () => {
    expect([container.dataset.scene, container.dataset.player]).toEqual(['opening', '560,590']);

    click(900, 585);
    await walk();
    expect([container.dataset.scene, container.dataset.player]).toEqual(['opening', '900,585']);

    button('Pub door').click();
    await walk();
    expect([container.dataset.scene, container.dataset.player]).toEqual(['pub', '250,585']);

    button('Street door').click();
    await walk();
    expect([container.dataset.scene, container.dataset.player]).toEqual(['opening', '705,590']);
    expect(renderer.shown()).toEqual(['opening', 'pub', 'opening']);
  });

  it('shows the renderer the room from the content and the state, with the protagonist as the player', () => {
    expect(renderer.calls[0]).toEqual({ method: 'mount' });
    expect(renderer.calls[1]).toEqual({
      method: 'show',
      view: {
        room: 'opening',
        entities: content.rooms.opening!.hotspots.map((h) => ({
          hotspot: h.id,
          model: h.id,
          rect: h.rect,
          visible: true,
        })),
        player: { model: 'cat', at: { x: 560, y: 590 } },
      },
    });
  });

  it('places the hotspot buttons at their bounds and speech at the head', async () => {
    const door = button('Pub door');
    expect([door.style.left, door.style.top, door.style.width, door.style.height]).toEqual([
      '49.53125%',
      '26%',
      '11.09375%',
      '39%',
    ]);
    button('Open mic board').click();
    await walk();
    const speech = container.querySelector<HTMLElement>('.speech')!;
    expect(speech.hidden).toBe(false);
    expect(speech.style.top).toBe(`${(100 * (game.state.at.y - 200)) / 800}%`);
  });

  it('takes no click in the UI bar, and hides a hotspot once it is gone', async () => {
    click(900, 700);
    expect(game.state.walk).toBeNull();
    button('Open mic flyer').click();
    await walk();
    expect(renderer.calls).toContainEqual({ method: 'setVisible', hotspot: 'flyer', visible: false });
    expect(button('Open mic flyer')).toBeNull();
  });
});
