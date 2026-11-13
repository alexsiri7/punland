import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEditorHost } from '../../src/app/editor';
import { sceneView } from '../../src/app/game';
import { GameSession } from '../../src/app/session';
import { layoutOf, moveHandle, newGame, type PublishResult } from '../../src/domain';
import { mountUi } from '../../src/presentation/ui';
import type { Draft, Drafts } from '../../src/services/editor';
import { FakeRenderer } from './fakes/renderer';
import { content, files } from './fixtures/content';

// The owner's edit mode (editor spec, "Edit mode" and "Publishing a room"): the UI's edit layer
// over the app's editor host, with the fixture content, a fake renderer and drafts in memory.

describe('the edit mode', () => {
  let container: HTMLElement;
  let renderer: FakeRenderer;
  let game: GameSession;
  let stored: Drafts;
  let editing: boolean[];
  let published: { room: string; draft: Draft }[];

  const street = layoutOf(content.rooms.street!);

  async function mount(drafts: Drafts = {}) {
    stored = drafts;
    editing = [];
    published = [];
    game = new GameSession(content, newGame(content), { save: async () => {} });
    renderer = new FakeRenderer();
    const host = createEditorHost({
      session: game,
      renderer,
      editing: (on) => editing.push(on),
      files,
      drafts: { load: () => structuredClone(stored), save: (d) => (stored = structuredClone(d)) },
      publish: async (room, draft): Promise<PublishResult> => {
        published.push({ room, draft });
        return { ok: true, url: 'https://github.com/pull/7' };
      },
    });
    await renderer.mount(container);
    await renderer.show(sceneView(game));
    const dialogue = { turn: async () => null };
    const ui = mountUi(container, game, renderer, { hover: () => {}, left: () => {} }, dialogue, host);
    ui.shown();
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
  });

  const editButton = () => container.querySelector<HTMLButtonElement>('.edit-button')!;
  const region = () => container.querySelector('[role="region"][aria-label="Edit mode"]');
  const handle = (name: string) => container.querySelector<HTMLButtonElement>(`.edit-handle[aria-label="${name}"]`)!;
  const tool = (name: string) =>
    [...container.querySelectorAll<HTMLButtonElement>('.edit-toolbar button')].find((b) => b.textContent === name)!;
  const status = () => container.querySelector('[role="status"]')?.textContent;
  const key = (target: EventTarget, init: KeyboardEventInit) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
  const flyer = () => game.content.rooms.street!.hotspots.find((h) => h.id === 'flyer')!;

  it('shows every point of the room and the floor outline, and pressing Edit again returns to play', async () => {
    await mount();
    editButton().click();
    expect(region()).not.toBeNull();
    expect(editButton().getAttribute('aria-pressed')).toBe('true');
    expect(editing).toEqual([true]);
    const labels = [...container.querySelectorAll('.edit-handle')].map((b) => b.getAttribute('aria-label'));
    expect(labels).toEqual([
      'Start',
      'Floor corner 1',
      'Floor corner 2',
      'Floor corner 3',
      'Floor corner 4',
      'Pub door walk-to',
      'Flyer walk-to',
      'Flyer spot',
      'Sign walk-to',
      'Echo walk-to',
    ]);
    expect(container.querySelector('.edit-floor')?.getAttribute('points')).toBe('0,500 1000,500 1000,600 0,600');
    const areas = [...container.querySelectorAll('.edit-label')].map((t) => t.textContent);
    expect(areas).toEqual(['→ pub', 'Flyer', 'Sign', 'Echo']);
    expect(container.querySelector('.edit-label.is-absent')?.textContent).toBe('Echo');
    expect(container.querySelector('.ui-bar')?.hasAttribute('inert')).toBe(true);

    editButton().click();
    expect(region()).toBeNull();
    expect(editing).toEqual([true, false]);
    expect(container.querySelector('.ui-bar')?.hasAttribute('inert')).toBe(false);
  });

  it('opens and closes with the E key, but not while typing', async () => {
    await mount();
    key(document.body, { key: 'e' });
    expect(region()).not.toBeNull();
    key(document.body, { key: 'E' });
    expect(region()).toBeNull();
    const input = document.createElement('input');
    container.append(input);
    key(input, { key: 'e' });
    key(document.body, { key: 'e', ctrlKey: true });
    expect(region()).toBeNull();
  });

  it('moves a spot live: the model stands there and play uses it, kept as a draft', async () => {
    await mount();
    editButton().click();
    key(handle('Flyer spot'), { key: 'ArrowRight', shiftKey: true });
    key(handle('Flyer spot'), { key: 'ArrowUp' });
    expect(flyer().target).toEqual({ entity: 'flyer', at: { x: 210, y: 519 } });
    expect(renderer.calls.at(-1)).toEqual({ method: 'place', hotspot: 'flyer', at: { x: 210, y: 519 } });
    expect(stored.street?.layout.hotspots.flyer?.at).toEqual({ x: 210, y: 519 });
    expect(stored.street?.base).toEqual(street);
    expect(handle('Flyer spot').style.left).toBe(`${(100 * 210) / 1280}%`);
  });

  it('drags a point with the pointer, only over the floor', async () => {
    await mount();
    editButton().click();
    const layer = container.querySelector<HTMLElement>('.edit-layer')!;
    layer.getBoundingClientRect = () => new DOMRect(0, 0, 640, 320);
    const start = handle('Start');
    const pointer = (type: string, x: number, y: number) =>
      start.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true }));
    pointer('pointerdown', 50, 275);
    pointer('pointermove', 60, 280);
    expect(game.content.rooms.street!.start).toEqual({ x: 120, y: 560 });
    const onFloor = renderer.onFloor;
    renderer.onFloor = () => false;
    pointer('pointermove', 70, 290);
    pointer('pointerup', 70, 290);
    expect(game.content.rooms.street!.start).toEqual({ x: 120, y: 560 });
    renderer.onFloor = onFloor;

    tool('Undo').click();
    expect(game.content.rooms.street!.start).toEqual({ x: 100, y: 550 });
    tool('Redo').click();
    expect(game.content.rooms.street!.start).toEqual({ x: 120, y: 560 });
  });

  it('adds and removes floor corners', async () => {
    await mount();
    editButton().click();
    handle('Floor corner 2').focus();
    tool('Add corner').click();
    expect(stored.street?.layout.walkable).toEqual([
      { x: 0, y: 500 },
      { x: 1000, y: 500 },
      { x: 1000, y: 550 },
      { x: 1000, y: 600 },
      { x: 0, y: 600 },
    ]);
    tool('Remove corner').click();
    expect(stored.street).toBeUndefined();
  });

  it('keeps an invalid edit as a draft but plays the last valid one, and refuses to publish it', async () => {
    await mount();
    editButton().click();
    for (let i = 0; i < 50; i++) key(handle('Floor corner 3'), { key: 'ArrowLeft', shiftKey: true });
    for (let i = 0; i < 8; i++) key(handle('Floor corner 3'), { key: 'ArrowUp', shiftKey: true });
    key(handle('Flyer spot'), { key: 'ArrowDown', shiftKey: true });
    expect(stored.street?.layout.walkable[2]).toEqual({ x: 500, y: 520 });
    expect(status()).toContain('content/rooms/street.json walkable: must be a convex polygon of at least 3 points');
    expect(game.content.rooms.street!.walkable[2]).toEqual({ x: 500, y: 570 });
    expect(flyer().target).toEqual({ entity: 'flyer', at: { x: 200, y: 520 } });

    tool('Publish').click();
    await vi.waitFor(() => expect(status()).toMatch(/^Can't publish: /));
    expect(published).toEqual([]);
  });

  it("doesn't publish without its screenshots", async () => {
    await mount();
    editButton().click();
    key(handle('Flyer spot'), { key: 'ArrowRight' });
    // jsdom draws nothing: a canvas has no 2D context.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    tool('Publish').click();
    expect(status()).toBe("Can't take the screenshots.");
    expect(published).toEqual([]);
  });

  it('publishes with the screenshots, then plays the deployed room again', async () => {
    await mount();
    editButton().click();
    key(handle('Flyer spot'), { key: 'ArrowRight' });
    const painted: string[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(paintRecorder(painted));
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,iVBORw0KGgo');
    tool('Publish').click();
    await vi.waitFor(() => expect(status()).toBe('Published: https://github.com/pull/7'));
    const layout = moveHandle(street, { kind: 'spot', hotspot: 'flyer' }, { x: 201, y: 520 });
    expect(published).toEqual([{ room: 'street', draft: { base: street, layout } }]);
    expect(painted).toContain('Flyer');
    expect(container.querySelector('[role="status"] a')?.getAttribute('href')).toBe('https://github.com/pull/7');
    expect(stored).toEqual({});
    expect(flyer().target).toEqual({ entity: 'flyer', at: { x: 200, y: 520 } });
    expect(tool('Publish').disabled).toBe(true);
  });

  it("publishes a room whatever another room's draft holds", async () => {
    const pub = layoutOf(content.rooms.pub!);
    const flat = { ...pub, walkable: [{ x: 0, y: 500 }, { x: 10, y: 500 }, { x: 20, y: 500 }] };
    await mount({ pub: { base: pub, layout: flat } });
    editButton().click();
    key(handle('Flyer spot'), { key: 'ArrowRight' });
    expect(status()).not.toMatch(/pub\.json/);
    expect(game.content.rooms.street!.hotspots.find((h) => h.id === 'flyer')!.target).toEqual({
      entity: 'flyer',
      at: { x: 201, y: 520 },
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(paintRecorder([]));
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,iVBORw0KGgo');
    tool('Publish').click();
    await vi.waitFor(() => expect(status()).toBe('Published: https://github.com/pull/7'));
    expect(published.map(({ room }) => room)).toEqual(['street']);
    expect(stored).toEqual({ pub: { base: pub, layout: flat } });
  });

  it("keeps playing another room's draft while this one is edited", async () => {
    const pub = layoutOf(content.rooms.pub!);
    const moved = moveHandle(pub, { kind: 'start' }, { x: pub.start.x + 1, y: pub.start.y });
    await mount({ pub: { base: pub, layout: moved } });
    editButton().click();
    key(handle('Flyer spot'), { key: 'ArrowRight' });
    expect(status()).toBe('');
    expect(game.content.rooms.street!.hotspots.find((h) => h.id === 'flyer')!.target).toEqual({
      entity: 'flyer',
      at: { x: 201, y: 520 },
    });
    expect(game.content.rooms.pub!.start).toEqual(moved.start);
  });

  it('discards a draft', async () => {
    await mount();
    editButton().click();
    key(handle('Start'), { key: 'ArrowRight' });
    tool('Discard').click();
    expect(stored).toEqual({});
    expect(game.content.rooms.street!.start).toEqual(street.start);
  });

  it("plays a kept draft from the start, unless its room has changed since", async () => {
    const moved = moveHandle(street, { kind: 'start' }, { x: 150, y: 560 });
    await mount({ street: { base: street, layout: moved } });
    expect(game.content.rooms.street!.start).toEqual({ x: 150, y: 560 });

    const stale = moveHandle(street, { kind: 'corner', index: 0 }, { x: 10, y: 500 });
    await mount({ street: { base: stale, layout: moved } });
    expect(game.content.rooms.street!.start).toEqual(street.start);
    expect(stored).toEqual({});
  });

  it('lays the hotspot buttons out again on leaving', async () => {
    await mount();
    const button = () => container.querySelector('[aria-label="Hotspots"] button[aria-label="Flyer"]');
    const before = button();
    editButton().click();
    editButton().click();
    expect(button()).not.toBeNull();
    expect(button()).not.toBe(before);
  });
});

/** A 2D context that only records the text drawn with it. */
function paintRecorder(painted: string[]): CanvasRenderingContext2D {
  const noop = () => {};
  return new Proxy({} as CanvasRenderingContext2D, {
    get: (_target, name) => (name === 'fillText' ? (text: string) => painted.push(text) : noop),
    set: () => true,
  });
}
