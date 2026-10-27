import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content';
import { fromSave, newGame, toSave } from '../../src/domain';

const content = loadContent();

describe('toSave', () => {
  it('saves the room, the spot, the inventory, the journey and the flags, and nothing transient', () => {
    const state = {
      ...newGame(content),
      flags: { 'pinned-flyer': true },
      room: 'pub',
      at: { x: 300, y: 580 },
      selected: 'flyer',
      saying: { line: 'Hi.', by: 'player' },
    };
    expect(toSave(state)).toEqual({
      version: 1,
      room: 'pub',
      at: { x: 300, y: 580 },
      inventory: { items: ['broken-guitar'], pickedUp: [] },
      journey: { left: {}, gathered: [] },
      flags: { 'pinned-flyer': true },
    });
  });
});

describe('fromSave', () => {
  it("resumes a save without a spot at the room's start", () => {
    const state = fromSave({ version: 1, room: 'pub' }, content);
    expect(state.at).toEqual(content.rooms.pub?.start);
    expect(state.inventory).toEqual(newGame(content).inventory);
    expect(state.flags).toEqual({});
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
