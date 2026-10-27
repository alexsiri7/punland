import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameSession } from '../../src/app/session';
import { loadContent } from '../../src/content';
import { type DialogueTurn, newGame } from '../../src/domain';
import { type DialogueBackend, mountUi } from '../../src/presentation/ui';

// The DOM UI (presentation/ui, docs/ARCHITECTURE.md section 5): the UI bar, the speech line and
// the room's controls and the dialogue panel, driven by the session and by hover.

const content = loadContent();

describe('the DOM UI', () => {
  let container: HTMLElement;
  let hovered: string[];
  let asked: { character: string; reply: string | null }[];
  let answers: ((turn: DialogueTurn | null) => void)[];
  const dialogue: DialogueBackend = {
    turn: (character, reply) => {
      asked.push({ character, reply });
      return new Promise((resolve) => answers.push(resolve));
    },
  };

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.append(container);
    hovered = [];
    asked = [];
    answers = [];
  });

  afterEach(() => {
    container.remove();
    vi.useRealTimers();
  });

  function mount(head = { x: 560, y: 300 }) {
    const game = new GameSession(content, newGame(content), { save: async () => {} });
    const canvas = document.createElement('canvas');
    const renderer = {
      canvas: () => canvas,
      onResize: () => () => {},
      hotspotBounds: (id: string) => content.rooms[game.state.room]?.hotspots.find((h) => h.id === id)?.rect ?? null,
      anchor: () => head,
    };
    const ui = mountUi(container, game, renderer, { hover: (name) => hovered.push(name) }, dialogue);
    ui.shown();
    const text = (selector: string) => container.querySelector(selector)?.textContent;
    const button = (group: string, name: string) =>
      container.querySelector<HTMLButtonElement>(`[aria-label="${group}"] button[aria-label="${name}"]`)!;
    return { game, ui, text, button };
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
    const { game, ui, text, button } = mount();
    game.dispatch({ type: 'activate', hotspot: 'door' });
    while (game.state.walk) game.dispatch({ type: 'tick', dtMs: 100 });
    expect(game.state.room).toBe('pub');
    expect(container.querySelector('.hotspots')).toBeNull();
    expect(container.querySelector('.worlds')).toBeNull();
    ui.shown();
    expect(container.querySelectorAll('.hotspots')).toHaveLength(1);
    expect(button('Hotspots', 'Open mic board')).toBeNull();
    expect(text('.ui-bar-label')).toBe(content.rooms.pub!.label);
  });

  describe('the dialogue panel', () => {
    const OPTIONS = ['Got any work?', 'Nice pub.', 'Any good?'];
    const turn = (line: string, extra: Partial<DialogueTurn> = {}): DialogueTurn => ({
      line,
      options: OPTIONS.map((text) => ({ text, reaches_goal: false })),
      goal_reached: false,
      ended: false,
      ...extra,
    });

    /** Walks into the pub and talks to the bartender. */
    function talk() {
      const mounted = mount();
      const { game, ui } = mounted;
      game.dispatch({ type: 'activate', hotspot: 'door' });
      while (game.state.walk) game.dispatch({ type: 'tick', dtMs: 100 });
      ui.shown();
      game.dispatch({ type: 'activate', hotspot: 'bartender' });
      while (game.state.walk) game.dispatch({ type: 'tick', dtMs: 100 });
      const panel = container.querySelector<HTMLElement>('[role="dialog"]')!;
      const options = () => [...panel.querySelectorAll('.dialogue-options button')].map((b) => b.textContent);
      const field = panel.querySelector('input')!;
      return { ...mounted, panel, options, field };
    }

    async function answer(next: DialogueTurn | null) {
      answers.shift()!(next);
      for (let i = 0; i < 5; i++) await Promise.resolve();
    }

    it("opens on talking to a character, with their opening line, three numbered replies and one's own", async () => {
      const { panel, options, field } = talk();
      expect(panel.hidden).toBe(false);
      expect(panel.getAttribute('aria-label')).toBe('Bartender');
      expect(asked).toEqual([{ character: 'bartender', reply: null }]);
      await answer(turn('Evening.'));
      expect(panel.querySelector('.dialogue-line')?.textContent).toBe('Evening.');
      expect(options()).toEqual(OPTIONS.map((text, i) => `${i + 1}${text}`));
      expect(field.closest('form')?.hidden).toBe(false);
    });

    it('sends a picked reply, by click or by its number, and a typed one', async () => {
      const { panel, field } = talk();
      await answer(turn('Evening.'));
      panel.querySelector<HTMLButtonElement>('.dialogue-options button')!.click();
      expect(panel.querySelector('.dialogue-said')?.textContent).toBe(OPTIONS[0]);
      await answer(turn('Maybe.'));
      panel.querySelector<HTMLButtonElement>('.dialogue-options button')!.dispatchEvent(
        new KeyboardEvent('keydown', { key: '2', bubbles: true }),
      );
      await answer(turn('It is.'));
      field.value = '  I play the kazoo. ';
      field.closest('form')!.requestSubmit();
      expect(asked.map((a) => a.reply)).toEqual([null, OPTIONS[0], OPTIONS[1], 'I play the kazoo.']);
      expect(field.value).toBe('');
    });

    it('types a number into the reply field without picking that option', async () => {
      const { field } = talk();
      await answer(turn('Evening.'));
      field.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }));
      expect(asked.map((a) => a.reply)).toEqual([null]);
    });

    it('tells the session when a reply reaches the goal, and offers no more replies once it ends', async () => {
      const { game, panel, options, field } = talk();
      const dispatch = vi.spyOn(game, 'dispatch');
      await answer(turn('Evening.'));
      panel.querySelector<HTMLButtonElement>('.dialogue-options button')!.click();
      await answer(turn('Fine. Start Friday.', { options: [], goal_reached: true, ended: true }));
      expect(dispatch).toHaveBeenCalledWith({ type: 'dialogueResult', character: 'bartender', goalReached: true });
      expect(options()).toEqual([]);
      expect(field.closest('form')?.hidden).toBe(true);
    });

    it("ends the conversation in character when the backend doesn't answer", async () => {
      const { panel, options, field } = talk();
      await answer(null);
      expect(panel.querySelector('.dialogue-line')?.textContent).toBe("Bartender doesn't answer.");
      expect(options()).toEqual([]);
      expect(field.closest('form')?.hidden).toBe(true);
    });

    it('closes on Leave, on Escape and on walking away, dropping an answer still on its way', async () => {
      const { game, panel } = talk();
      panel.querySelector<HTMLButtonElement>('.dialogue-leave')!.click();
      expect(panel.hidden).toBe(true);
      await answer(turn('Too late.'));
      expect(panel.querySelector('.dialogue-line')?.textContent).toBe('…');

      game.dispatch({ type: 'activate', hotspot: 'bartender' });
      game.dispatch({ type: 'tick', dtMs: 100 });
      expect(panel.hidden).toBe(false);
      panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(panel.hidden).toBe(true);

      game.dispatch({ type: 'activate', hotspot: 'bartender' });
      game.dispatch({ type: 'tick', dtMs: 100 });
      game.dispatch({ type: 'walk', to: { x: 300, y: 580 } });
      game.dispatch({ type: 'tick', dtMs: 100 });
      expect(panel.hidden).toBe(true);
    });
  });
});
