import { describe, expect, it } from 'vitest';
import locations from '../../scripts/annie-locations.json';
import characters from '../../src/content/characters.json';
import objects from '../../src/content/objects.json';
import pub from '../../src/content/rooms/pub.json';

// scripts/annie-snapshots.mjs posts each mapped room of a deploy to Annie with its things (#130):
// a thing's key, kind and look text are what Annie outlines and shows, and a room the mapping
// names must exist, or it drops out of Annie unseen.

const SCRIPT = '../../scripts/annie-snapshots.mjs';
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Script {
  snapshotThings(
    room: unknown,
    entities: { characters: Set<string>; objects: Set<string> },
    boxes: Map<string, Box>,
    protagonist: string,
  ): { key: string; name: string; description: string; kind: string; box: Box }[];
}

const rooms = Object.keys(import.meta.glob('/src/content/rooms/*.json')).map((path) =>
  path.replace(/^.*\/(.*)\.json$/, '$1'),
);

describe('the Annie snapshots', () => {
  it("send a room's hotspots on screen, in room order, with their kind and look text", async () => {
    const { snapshotThings }: Script = await import(/* @vite-ignore */ SCRIPT);
    const entities = {
      characters: new Set(characters.characters.map(({ id }) => id)),
      objects: new Set(objects.objects.map(({ id }) => id)),
    };
    const box = (x: number): Box => ({ x, y: 100, w: 50, h: 80 });
    const boxes = new Map([
      ['fame', box(500)],
      ['bartender', box(1000)],
      ['door', box(100)],
    ]);
    const fame = pub.hotspots.find((h) => h.id === 'fame')!;
    const look = fame.interactions.find((i) => i.verb === 'look')!.effects[0] as { say: string };

    expect(snapshotThings(pub, entities, boxes, 'Paws Anka')).toEqual([
      { key: 'door', name: 'Street door', description: '', kind: 'scene', box: box(100) },
      { key: 'bartender', name: 'Bartender', description: '', kind: 'character', box: box(1000) },
      { key: 'fame', name: fame.name, description: look.say, kind: 'scene', box: box(500) },
    ]);
  });

  it('map only rooms there are', () => {
    for (const room of Object.keys(locations)) expect(rooms, room).toContain(room);
  });
});
