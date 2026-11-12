import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playGame } from '../../src/app/game';
import { GameSession } from '../../src/app/session';
import { newGame } from '../../src/domain';
import { FakeRenderer } from './fakes/renderer';
import { content, editedRoom } from './fixtures/content';

// The app plays the session through the Renderer interface (docs/ARCHITECTURE.md, section 5),
// whichever renderer draws it: here a fake one, checked through the #game mirror.

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

  it('plays street, pub and street again, and the mirror follows', async () => {
    expect([container.dataset.scene, container.dataset.player]).toEqual(['street', '100,550']);

    click(900, 585);
    await walk();
    expect([container.dataset.scene, container.dataset.player]).toEqual(['street', '900,585']);

    button('Pub door').click();
    await walk();
    expect([container.dataset.scene, container.dataset.player]).toEqual(['pub', '300,550']);

    button('Street door').click();
    await walk();
    expect([container.dataset.scene, container.dataset.player]).toEqual(['street', '510,560']);
    expect(renderer.shown()).toEqual(['street', 'pub', 'street']);
  });

  it('shows the renderer the room from the content and the state, with the protagonist as the player', () => {
    expect(renderer.calls[0]).toEqual({ method: 'mount' });
    expect(renderer.calls[1]).toEqual({
      method: 'show',
      view: {
        room: 'street',
        model: 'scene/street',
        entities: [
          { hotspot: 'door', node: 'door', visible: true },
          { hotspot: 'flyer', model: 'object/flyer', at: { x: 200, y: 520 }, visible: true },
          { hotspot: 'sign', node: 'sign', visible: true },
          { hotspot: 'echo', node: 'echo', visible: false },
        ],
        player: { model: 'character/protagonist', at: { x: 100, y: 550 } },
      },
    });
  });

  it('places the hotspot buttons at their bounds and speech at the head', async () => {
    const door = button('Pub door');
    expect([door.style.left, door.style.top, door.style.width, door.style.height]).toEqual([
      '35%',
      '25%',
      '10%',
      '40%',
    ]);
    button('Sign').click();
    await walk();
    const speech = container.querySelector<HTMLElement>('.speech')!;
    expect(speech.hidden).toBe(false);
    expect(speech.style.top).toBe(`${(100 * (game.state.at.y - 200)) / 800}%`);
  });

  it('takes no click in the UI bar, and hides a hotspot once it is gone', async () => {
    click(900, 700);
    expect(game.state.walk).toBeNull();
    button('Flyer').click();
    await walk();
    expect(renderer.calls).toContainEqual({ method: 'setVisible', hotspot: 'flyer', visible: false });
    expect(button('Flyer')).toBeNull();
  });

  it('keeps the line and the conversation of an interaction that brings a hotspot into the room', async () => {
    const given = editedRoom('street', (room) => {
      room.hotspots.find((h: { id: string }) => h.id === 'door').presentWhen = [{ flag: 'lit' }];
      room.hotspots.find((h: { id: string }) => h.id === 'sign').interactions = [
        { verb: 'look', effects: [{ say: 'The door!' }, { set: 'lit', to: true }, { talk: 'bartender' }] },
      ];
    });
    container.remove();
    container = document.createElement('div');
    document.body.append(container);
    renderer = new FakeRenderer();
    game = new GameSession(given, newGame(given), { save: async () => {} });
    await playGame(container, game, renderer, { turn: () => new Promise(() => {}) });
    expect(button('Pub door')).toBeNull();

    button('Sign').click();
    await walk();
    expect(renderer.calls).toContainEqual({ method: 'setVisible', hotspot: 'door', visible: true });
    expect(renderer.shown()).toEqual(['street']);
    expect(button('Pub door')).not.toBeNull();
    expect(container.dataset.say).toBe('The door!');
    expect(container.querySelector<HTMLElement>('.speech')!.hidden).toBe(false);
    expect(container.querySelector<HTMLElement>('[aria-label="Bartender"]')!.hidden).toBe(false);
  });

  it("plays the first room's cutscene once it is drawn, its frames ticking its waits", async () => {
    const given = editedRoom('street', (room) => {
      room.onStart = [{ effects: [{ wait: 150 }, { say: 'Here at last.' }] }];
    });
    container.remove();
    container = document.createElement('div');
    document.body.append(container);
    renderer = new FakeRenderer();
    game = new GameSession(given, newGame(given), { save: async () => {} });
    await playGame(container, game, renderer, { turn: async () => null });
    expect(game.state.cue).not.toBeNull();

    renderer.step(100);
    expect(container.dataset.say).toBe('');
    renderer.step(100);
    expect(game.state.cue).toBeNull();
    expect(container.dataset.say).toBe('Here at last.');
  });

  it('takes input only once the latest room asked for is drawn', async () => {
    const drawn: Array<() => void> = [];
    renderer.show = () => new Promise((resolve) => drawn.push(resolve));
    game.dispatch({ type: 'activate', hotspot: 'door' });
    await walk();
    game.dispatch({ type: 'activate', hotspot: 'door' });
    await walk();
    expect([game.state.room, drawn.length]).toEqual(['street', 2]);

    drawn[0]!();
    await vi.advanceTimersByTimeAsync(0);
    expect(button('Pub door')).toBeNull();

    drawn[1]!();
    await vi.advanceTimersByTimeAsync(0);
    expect(button('Pub door')).not.toBeNull();
    expect([container.dataset.scene, container.dataset.player]).toEqual(['street', '510,560']);
  });

  it('hovers and activates the hotspot a renderer that picks hotspots finds on its canvas', async () => {
    renderer.pick = (screen) => (screen.x < 100 ? { kind: 'hotspot', hotspot: 'sign' } : { kind: 'none' });
    const canvas = renderer.canvas();
    const pointer = (type: string, x: number) =>
      canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: 400 }));

    pointer('pointermove', 50);
    expect(container.dataset.hover).toBe('Sign');
    pointer('pointermove', 500);
    expect(container.dataset.hover).toBe('');
    pointer('pointermove', 50);
    pointer('pointerleave', 50);
    expect(container.dataset.hover).toBe('');

    pointer('pointerdown', 50);
    await walk();
    expect(container.dataset.say).toMatch(/\S/);
  });
});
