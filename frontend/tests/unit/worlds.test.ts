import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content';

// Worlds are content data, like rooms. The content validator checks that worlds.json and the
// rooms' worlds hold together (content.test.ts); this checks today's worlds (worlds spec).

const { worlds, rooms, start } = loadContent();
const world = (id: string) => worlds.find((w) => w.id === id);
const hotspots = Object.values(rooms).flatMap((room) => room.hotspots.map((h) => ({ room, h })));

describe('world content', () => {
  it('has the street, online and dream worlds, starting in the street', () => {
    expect(worlds.map((w) => w.id)).toEqual(['street', 'online', 'dream']);
    expect(rooms[start.room]?.world).toBe('street');
    expect(world('street')?.locked).toBeUndefined();
  });

  it('shows dream material only in the dream, once the street can give it', () => {
    const gathers = ({ h }: (typeof hotspots)[number]) =>
      h.interactions.flatMap(({ effects }) => effects.flatMap((effect) => ('gather' in effect ? [effect.gather] : [])));
    const given = hotspots.filter(({ room }) => room.world !== 'dream').flatMap(gathers);
    for (const spot of hotspots) {
      const { room, h } = spot;
      if (gathers(spot).length > 0) expect(room.world, h.id).not.toBe('dream');
      for (const condition of h.presentWhen ?? []) {
        if (!('gathered' in condition)) continue;
        expect(room.world, h.id).toBe('dream');
        expect(given, h.id).toContain(condition.gathered);
      }
    }
  });
});
