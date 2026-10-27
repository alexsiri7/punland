import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content';
import { PROTAGONIST } from '../../src/content/protagonist';
import type { FloorPoint } from '../../src/domain/geometry';

// Rooms are content data: adding one must not need a code change. The content validator checks
// that every room file holds together (content.test.ts); this checks each room against its art.

// The layer fields RoomScene reads; scripts/render-art.mjs writes them.
const art = import.meta.glob<{ layers: { actor?: string; foot?: FloorPoint }[] }>('../../public/rooms/*/art.json', {
  eager: true,
  import: 'default',
});

const { rooms, start } = loadContent();

describe('room content', () => {
  it('starts a new game outside The Three Crows', () => {
    expect(start.room).toBe('opening');
  });

  describe.each(Object.entries(rooms))('%s', (id, room) => {
    const actors = (art[`../../public/rooms/${id}/art.json`]?.layers ?? []).map((layer) => layer.actor);

    it('has art for each hotspot that comes and goes', () => {
      for (const h of room.hotspots) {
        // The room engine hides a hotspot that comes and goes by its art actor of the same id.
        if (h.action.type === 'pickup' || h.shownWith !== undefined) expect(actors, h.id).toContain(h.id);
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
