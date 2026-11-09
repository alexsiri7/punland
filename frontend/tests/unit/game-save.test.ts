import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content';
import { fromSave, isSaveGame, newGame, type SaveGame, toSave } from '../../src/domain';

const content = loadContent();

describe('toSave', () => {
  it('saves the room, the spot, the inventory, the journey, the flags and the progress, and nothing transient', () => {
    const state = {
      ...newGame(content),
      flags: { 'pinned-flyer': true },
      goals: ['working-guitar'],
      stats: { followers: 10, musicians: 0, practice: 0, instruments: 1 },
      room: 'pub',
      at: { x: 300, y: 580 },
      selected: 'lesson-flyer',
      saying: { line: 'Hi.', by: 'player' },
    };
    expect(toSave(state)).toEqual({
      version: 1,
      room: 'pub',
      at: { x: 300, y: 580 },
      inventory: { items: ['broken-guitar'], pickedUp: [] },
      journey: { left: {}, gathered: [] },
      flags: { 'pinned-flyer': true },
      act: '1',
      goals: ['working-guitar'],
      stats: { followers: 10, musicians: 0, practice: 0, instruments: 1 },
    });
  });
});

describe('fromSave', () => {
  it("resumes a save without a spot at the room's start", () => {
    const state = fromSave({ version: 1, room: 'pub' }, content);
    expect(state.at).toEqual(content.rooms.pub?.start);
    expect(state.inventory).toEqual(newGame(content).inventory);
    expect(state.flags).toEqual({});
    expect(state.act).toBe(content.acts[0]?.id);
    expect(state.goals).toEqual([]);
    expect(state.stats).toEqual({ followers: 0, musicians: 0, practice: 0, instruments: 1 });
  });

  it('resumes the act, its reached goals and the stats', () => {
    const state = fromSave(
      { version: 1, room: 'pub', act: '3', goals: ['act3-first'], stats: { followers: 5000, instruments: 2 } },
      content,
    );
    expect(state.act).toBe('3');
    expect(state.goals).toEqual(['act3-first']);
    expect(state.stats).toEqual({ followers: 5000, musicians: 0, practice: 0, instruments: 2 });
  });

  it('drops acts, goals and stats the content no longer has', () => {
    const gone = fromSave({ version: 1, room: 'pub', act: 'gone', goals: ['working-guitar'] }, content);
    expect(gone.act).toBe(content.acts[0]?.id);
    expect(gone.goals).toEqual([]);
    const state = fromSave(
      { version: 1, room: 'pub', act: '1', goals: ['working-guitar', 'act3-first', 'gone'], stats: { fame: 3 } },
      content,
    );
    expect(state.act).toBe('1');
    expect(state.goals).toEqual(['working-guitar']);
    expect(state.stats).toEqual({ followers: 0, musicians: 0, practice: 0, instruments: 1 });
  });

  it('drops items and rooms the content no longer has, and keeps the flags', () => {
    const state = fromSave(
      {
        version: 1,
        room: 'gone',
        at: { x: 1, y: 2 },
        inventory: { items: ['broken-guitar', 'gone-item'], pickedUp: ['gone-item'] },
        journey: { left: { street: { room: 'pub' }, dream: { room: 'gone' } }, gathered: ['open-mic'] },
        flags: { 'pinned-flyer': true },
      },
      content,
    );
    expect(state.room).toBe(content.start.room);
    expect(state.at).toEqual(newGame(content).at);
    expect(state.inventory).toEqual({ carried: ['broken-guitar'], pickedUp: ['gone-item'] });
    expect(state.journey).toEqual({ left: { street: { room: 'pub' } }, gathered: ['open-mic'] });
    expect(state.flags).toEqual({ 'pinned-flyer': true });
  });

  it('drops a room named after a property every object inherits', () => {
    const state = fromSave({ version: 1, room: 'constructor', at: { x: 1, y: 2 } }, content);
    expect(state.room).toBe(content.start.room);
    expect(state.at).toEqual(newGame(content).at);
  });
});

describe('isSaveGame', () => {
  const game: SaveGame = { version: 1, room: 'opening', savedAt: '2026-10-24T12:00:00.000Z' };

  it('accepts what toSave makes, once stamped', () => {
    expect(isSaveGame({ ...toSave(newGame(content)), savedAt: game.savedAt })).toBe(true);
  });

  it('accepts a save from before inventory and journey were saved', () => {
    expect(isSaveGame(game)).toBe(true);
  });

  it('accepts inventory, journey, flags and progress, and ignores fields it does not know', () => {
    const full = {
      ...game,
      inventory: { items: ['flyer'], pickedUp: ['flyer'] },
      journey: { left: { street: { room: 'pub', at: { x: 1, y: 2 } }, dream: { room: 'dream' } }, gathered: [] },
      at: { x: 3, y: 4 },
      flags: { 'pinned-flyer': true, coins: 2, band: 'The Crows' },
      act: '2',
      goals: ['act2-first'],
      stats: { followers: 10, practice: 0 },
      mood: 'hopeful',
    };
    expect(isSaveGame(full)).toBe(true);
  });

  it('rejects a malformed spot, inventory, journey, flags or progress', () => {
    expect(isSaveGame({ ...game, at: { x: 1 } })).toBe(false);
    expect(isSaveGame({ ...game, inventory: { items: 'flyer', pickedUp: [] } })).toBe(false);
    expect(isSaveGame({ ...game, journey: { left: { street: { at: { x: 1, y: 2 } } }, gathered: [] } })).toBe(false);
    expect(isSaveGame({ ...game, journey: { left: { street: { room: 'pub', at: 'here' } }, gathered: [] } })).toBe(false);
    expect(isSaveGame({ ...game, flags: { 'pinned-flyer': null } })).toBe(false);
    expect(isSaveGame({ ...game, flags: [true] })).toBe(false);
    expect(isSaveGame({ ...game, act: 2 })).toBe(false);
    expect(isSaveGame({ ...game, goals: 'pub-job' })).toBe(false);
    expect(isSaveGame({ ...game, stats: { followers: '10' } })).toBe(false);
    expect(isSaveGame({ ...game, stats: [10] })).toBe(false);
  });
});
