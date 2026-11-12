// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content';
import { PROTAGONIST } from '../../src/content/protagonist';
import { type Command, type GameEvent, type GameState, newGame, speechMs } from '../../src/domain';
import { apply, isPresent } from '../../src/rules';

// Act 1's opening as the story has it (story/CANON.md, #116): the Arrival in the coach station,
// the map stand, and the map, played through the rules on the real content.

const content = loadContent();
const activate = (hotspot: string): Command => ({ type: 'activate', hotspot });

/** Applies each command, ticking after each until the player stands still and no wait is left. */
function play(state: GameState, commands: readonly Command[]): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  for (const command of commands) {
    let step = apply(content, state, command);
    events.push(...step.events);
    while (step.state.walk || step.state.cue) {
      step = apply(content, step.state, { type: 'tick', dtMs: 50 });
      events.push(...step.events);
    }
    state = step.state;
  }
  return { state, events };
}

const present = (state: GameState, id: string) =>
  content.rooms[state.room]!.hotspots.some((h) => h.id === id && isPresent(state, h));

describe('the coach station', () => {
  it('plays the Arrival on a new game: the coach comes and goes, then the lines in order', () => {
    const { state, events } = play(newGame(content), [{ type: 'begin' }]);
    const shown = events.flatMap((e) => (e.type === 'hotspotShown' || e.type === 'hotspotHidden' ? [e] : []));
    expect(shown).toEqual([
      { type: 'hotspotShown', hotspot: 'coach' },
      { type: 'hotspotHidden', hotspot: 'coach' },
    ]);
    const said = events.flatMap((e) => (e.type === 'said' ? [[e.by, e.line]] : []));
    expect(said).toEqual([
      ['player', 'Punland.'],
      ['player', `Hi, I'm ${PROTAGONIST.name}, and I want to be a star!`],
      ['cop', 'A star? Son, the only star I know about is the one on my badge.'],
      ['cop', "But you could try The Three Crows. That's where the music lot go."],
      ['player', 'Three crows? We only had the one crow in Literal Village.'],
      ['cop', "It's a pub, son. Grab a map from the stand. You'll get lost otherwise."],
      ['player', 'Oh! Right. Thanks. Bye!'],
    ]);
    expect(state).toMatchObject({ room: 'coach-station', cue: null, flags: { arrived: true } });
    expect(apply(content, state, { type: 'begin' })).toEqual({ state, events: [] });
  });

  it('keeps the player waiting until each line of the Arrival has been up its time, and the last has gone', () => {
    // The speech line shows each line for speechMs; a click before the cutscene ends would hush the rest.
    const lines: { line: string; at: number }[] = [];
    let step = apply(content, newGame(content), { type: 'begin' });
    let ms = 0;
    while (step.state.cue) {
      step = apply(content, step.state, { type: 'tick', dtMs: 50 });
      ms += 50;
      for (const e of step.events) if (e.type === 'said') lines.push({ line: e.line, at: ms });
    }
    expect(lines).toHaveLength(7);
    lines.forEach(({ line, at }, i) => {
      expect((lines[i + 1]?.at ?? ms) - at, line).toBeGreaterThanOrEqual(speechMs(line));
    });

    let state = apply(content, newGame(content), { type: 'begin' }).state;
    for (let ms = 0; ms < 3300 + speechMs('Punland.') / 2; ms += 50) {
      state = apply(content, state, { type: 'tick', dtMs: 50 }).state;
    }
    expect(state.saying?.line).toBe('Punland.');
    expect(apply(content, state, { type: 'walk', to: state.at })).toEqual({ state, events: [] });
  });

  it("doesn't play the Arrival for a game that started outside The Three Crows", () => {
    const old = { ...newGame(content), visited: ['opening', 'coach-station'] };
    expect(apply(content, old, { type: 'begin' })).toEqual({ state: old, events: [] });
  });

  it('gives a map from the stand, which then only gets a look', () => {
    const start = newGame(content);
    expect([present(start, 'map-stand'), present(start, 'map-stand-taken')]).toEqual([true, false]);
    const { state, events } = play(start, [activate('map-stand')]);
    expect(state.inventory.carried).toContain('map');
    expect(events).toContainEqual({
      type: 'said',
      line: '"Punland: free map." Free? In Literal Village, even the free things cost something.',
      by: 'player',
    });
    expect([present(state, 'map-stand'), present(state, 'map-stand-taken')]).toEqual([false, true]);
    expect(play(state, [activate('map-stand-taken')]).state.saying?.line).toBe(
      "I've got one already. One map is plenty. Two maps is a library.",
    );
  });

  it('leads up the road to outside The Three Crows, where the cop is not, and back', () => {
    const { state } = play(newGame(content), [activate('road')]);
    expect(state.room).toBe('opening');
    expect(content.rooms.opening!.hotspots.map((h) => h.id)).not.toContain('cop');
    expect(play(state, [activate('station')]).state.room).toBe('coach-station');
  });
});

describe('the map', () => {
  const withMap = play(newGame(content), [activate('map-stand'), activate('road')]).state;
  const useMap: Command = { type: 'useItem', item: 'map' };

  it('opens from the inventory, marking only the places the cat knows about', () => {
    const { state } = play(withMap, [useMap]);
    expect(state.room).toBe('map');
    expect(['coach-station', 'pub', 'high-street', 'mayors-office'].map((id) => present(state, id))).toEqual([
      true,
      true,
      false,
      false,
    ]);
    const known = { ...state, visited: [...state.visited, 'high-street'], flags: { 'string-sold-out': true } };
    expect(present(known, 'high-street')).toBe(true);
    expect(present(known, 'mayors-office')).toBe(true);
  });

  it('goes to a marked place, or closes back where it was opened', () => {
    const opened = play(withMap, [useMap]).state;
    expect(play(opened, [activate('coach-station')]).state.room).toBe('coach-station');
    const closed = play(opened, [activate('close')]).state;
    expect(closed).toMatchObject({ room: 'opening', at: withMap.at });
  });

  it("is only selected outside the street, where it can't take the cat", () => {
    const dreaming = { ...withMap, room: 'dream', at: content.rooms.dream!.start };
    expect(apply(content, dreaming, useMap).state).toMatchObject({ room: 'dream', selected: 'map' });
  });
});
