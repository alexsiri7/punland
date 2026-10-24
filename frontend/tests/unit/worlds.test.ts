import { describe, expect, it } from 'vitest';
import { rooms, START_ROOM } from '../../src/content/rooms';
import { worlds } from '../../src/content/worlds';

// Worlds are content data, like rooms: this checks that worlds.json and the rooms' worlds
// hold together (worlds spec; progress spec, "Story as content").

const world = (id: string) => worlds.find((w) => w.id === id);
const hotspots = Object.values(rooms).flatMap((room) => room.hotspots.map((h) => ({ room, h })));

describe('world content', () => {
  it('has the street, online and dream worlds, starting in the street', () => {
    expect(worlds.map((w) => w.id)).toEqual(['street', 'online', 'dream']);
    expect(rooms[START_ROOM].world).toBe('street');
    expect(world('street')?.locked).toBeUndefined();
  });

  it.each(worlds)('starts $id in one of its own rooms', (w) => {
    expect(rooms[w.start]?.world).toBe(w.id);
    if (w.locked !== undefined) expect(w.locked).toMatch(/\S/);
  });

  it('puts every room in a world', () => {
    for (const [id, room] of Object.entries(rooms)) expect(world(room.world), id).toBeDefined();
  });

  it('shows dream material only in the dream, once the street can give it', () => {
    const given = hotspots.filter(({ room }) => room.world !== 'dream').map(({ h }) => h.dreamMaterial);
    for (const { room, h } of hotspots) {
      if (h.dreamMaterial !== undefined) expect(room.world, h.id).not.toBe('dream');
      if (h.shownWith === undefined) continue;
      expect(room.world, h.id).toBe('dream');
      expect(given, h.id).toContain(h.shownWith);
    }
  });
});
