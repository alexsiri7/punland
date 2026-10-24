import { describe, expect, it } from 'vitest';
import { PROTAGONIST } from '../../src/content/protagonist';
import { ACTION_TYPES, type Point, rooms, START_ROOM } from '../../src/content/rooms';
import { insidePolygon } from '../../src/room/walk';
import { SCENE_HEIGHT, SCENE_WIDTH } from '../../src/theme';

// Rooms are content data: adding one must not need a code change, so this checks that every
// room file holds together (progress spec, "Story as content").

// The layer fields RoomScene reads; scripts/render-art.mjs writes them.
const art = import.meta.glob<{ layers: { actor?: string; foot?: Point }[] }>('../../public/rooms/*/art.json', {
  eager: true,
  import: 'default',
});

/** The player walks in straight lines, which only stay on a convex floor. */
function convex(poly: Point[]): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const [a, b, c] = [poly[i], poly[(i + 1) % poly.length], poly[(i + 2) % poly.length]];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross === 0) continue;
    if (sign !== 0 && Math.sign(cross) !== sign) return false;
    sign = Math.sign(cross);
  }
  return true;
}

describe('room content', () => {
  it('has the start room', () => {
    expect(rooms[START_ROOM]).toBeDefined();
  });

  describe.each(Object.entries(rooms))('%s', (id, room) => {
    it('has a convex floor the player starts on', () => {
      expect(room.walkable.length).toBeGreaterThanOrEqual(3);
      expect(convex(room.walkable)).toBe(true);
      expect(insidePolygon(room.start, room.walkable)).toBe(true);
    });

    it('has hotspots inside the scene, each reachable on foot', () => {
      expect(new Set(room.hotspots.map((h) => h.id)).size).toBe(room.hotspots.length);
      for (const h of room.hotspots) {
        expect(h.rect.x).toBeGreaterThanOrEqual(0);
        expect(h.rect.y).toBeGreaterThanOrEqual(0);
        expect(h.rect.x + h.rect.width).toBeLessThanOrEqual(SCENE_WIDTH);
        expect(h.rect.y + h.rect.height).toBeLessThanOrEqual(SCENE_HEIGHT);
        expect(insidePolygon(h.walkTo, room.walkable), h.id).toBe(true);
      }
    });

    it('has hotspot actions the room engine knows', () => {
      for (const h of room.hotspots) {
        expect(Object.keys(ACTION_TYPES), h.id).toContain(h.action.type);
        if (h.action.type === 'say') expect(h.action.line, h.id).toMatch(/\S/);
      }
    });

    it('has exits that lead onto the floor of an existing room', () => {
      for (const h of room.hotspots) {
        if (h.action.type !== 'exit') continue;
        const to = rooms[h.action.room];
        expect(to, h.id).toBeDefined();
        if (h.action.at) expect(insidePolygon(h.action.at, to.walkable), h.id).toBe(true);
      }
    });

    it('has art with the player in it, standing on their feet', () => {
      const layers = art[`../../public/rooms/${id}/art.json`]?.layers ?? [];
      const player = layers.find((layer) => layer.actor === PROTAGONIST.actor);
      expect(player).toBeDefined();
      expect(player?.foot).toEqual({ x: expect.any(Number), y: expect.any(Number) });
    });
  });
});
