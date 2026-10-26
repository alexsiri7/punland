import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameSession } from '../../src/app/session';
import { loadContent } from '../../src/content';
import { newGame } from '../../src/domain';
import { type DrawnRoom, mountUi } from '../../src/presentation/ui';

// The DOM UI (presentation/ui, docs/ARCHITECTURE.md section 5): the UI bar, the speech line and
// the room's controls, driven by the session and by hover.

const content = loadContent();

describe('the DOM UI', () => {
  let container: HTMLElement;
  let hovered: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.append(container);
    hovered = [];
  });

  afterEach(() => {
    container.remove();
    vi.useRealTimers();
  });

  function mount(head = { x: 560, y: 300 }) {
    const game = new GameSession(content, newGame(content), { save: async () => {} });
    const ui = mountUi(container, game, { hover: (name) => hovered.push(name) });
    const room: DrawnRoom = {
      canvas: document.createElement('canvas'),
      head: () => head,
      onResize: () => () => {},
    };
    ui.shown(room);
    const text = (selector: string) => container.querySelector(selector)?.textContent;
    const button = (group: string, name: string) =>
      container.querySelector<HTMLButtonElement>(`[aria-label="${group}"] button[aria-label="${name}"]`)!;
    return { game, ui, room, text, button };
  }

  it("shows the room's label, place and hint in the UI bar", () => {
    const { text } = mount();
    expect(text('.ui-bar-label')).toBe('PUNLAND · HIGH STREET');
    expect(text('.ui-bar-action')).toBe('OutsideThe Three Crows');
    expect(text('.ui-bar-hint')).toBe(content.rooms.opening!.hint);
  });

  it('puts the hovered hotspot on the action line and reports it for the mirror', () => {
    const { text, button } = mount();
    button('Hotspots', 'Open mic board').dispatchEvent(new Event('pointerenter'));
    expect([text('.ui-bar-verb'), text('.ui-bar-name')]).toEqual(['Look at', 'Open mic board']);
    button('Hotspots', 'Open mic board').dispatchEvent(new Event('pointerleave'));
    expect([text('.ui-bar-verb'), text('.ui-bar-name')]).toEqual(['Outside', 'The Three Crows']);
    expect(hovered).toEqual(['Open mic board', '']);
  });

  it('says what the selected item would be used on', () => {
    const { game, text, button } = mount();
    button('Inventory', 'Broken guitar').click();
    expect(game.state.selected).toBe('broken-guitar');
    expect([text('.ui-bar-verb'), text('.ui-bar-name')]).toEqual(['Use', 'Broken guitar']);
    button('Hotspots', 'Open mic board').dispatchEvent(new Event('pointerenter'));
    expect([text('.ui-bar-verb'), text('.ui-bar-name')]).toEqual(['Use Broken guitar on', 'Open mic board']);
  });

  it('shows what the player says until they are hushed or the line has been up long enough', () => {
    const { game } = mount();
    const speech = container.querySelector<HTMLElement>('.speech')!;
    game.dispatch({ type: 'activate', hotspot: 'board' });
    while (game.state.walk) game.dispatch({ type: 'tick', dtMs: 100 });
    expect(speech.hidden).toBe(false);
    expect(speech.textContent).toMatch(/open mic/i);
    expect([speech.style.left, speech.style.top]).toEqual(['43.75%', '37.5%']);
    vi.advanceTimersByTime(60_000);
    expect(speech.hidden).toBe(true);
  });

  it('keeps a line spoken near the edge of the scene inside it', () => {
    const { game } = mount({ x: 4, y: -40 });
    const speech = container.querySelector<HTMLElement>('.speech')!;
    game.dispatch({ type: 'activate', hotspot: 'board' });
    while (game.state.walk) game.dispatch({ type: 'tick', dtMs: 100 });
    // jsdom lays nothing out, so the line is 0 wide: kept 16 scene px from the left and top.
    expect([speech.style.left, speech.style.top]).toEqual(['1.25%', '2%']);
  });

  it('clears the action line and the hover when the player clicks the floor', () => {
    const { ui, text, button } = mount();
    button('Hotspots', 'Open mic board').focus();
    expect(text('.ui-bar-name')).toBe('Open mic board');
    ui.walked();
    expect([text('.ui-bar-verb'), text('.ui-bar-name')]).toEqual(['Outside', 'The Three Crows']);
    expect(hovered.at(-1)).toBe('');
  });

  it("swaps in the new room's controls once it is shown, and takes the old ones away at once", () => {
    const { game, ui, room, text, button } = mount();
    game.dispatch({ type: 'activate', hotspot: 'door' });
    while (game.state.walk) game.dispatch({ type: 'tick', dtMs: 100 });
    expect(game.state.room).toBe('pub');
    expect(container.querySelector('.hotspots')).toBeNull();
    expect(container.querySelector('.worlds')).toBeNull();
    ui.shown(room);
    expect(container.querySelectorAll('.hotspots')).toHaveLength(1);
    expect(button('Hotspots', 'Open mic board')).toBeNull();
    expect(text('.ui-bar-label')).toBe(content.rooms.pub!.label);
  });
});
