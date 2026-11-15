import { describe, expect, it } from 'vitest';
import locations from '../../scripts/annie-locations.json';
import { loadContent } from '../../src/content';
import { fromSave, type GameState } from '../../src/domain';
import { allHold } from '../../src/rules';

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
    content: ReturnType<typeof loadContent>,
    holds: typeof allHold,
    state: GameState,
    boxes: Map<string, Box>,
    protagonist: string,
  ): { key: string; name: string; description: string; kind: string; box: Box }[];
}

const content = loadContent();
const inRoom = (room: string): GameState => fromSave({ version: 1, room, visited: [room] }, content);
const box = (x: number): Box => ({ x, y: 100, w: 50, h: 80 });

describe('the Annie snapshots', () => {
  it("send a room's hotspots on screen, in room order, with their kind and look text", async () => {
    const { snapshotThings }: Script = await import(/* @vite-ignore */ SCRIPT);
    const boxes = new Map([
      ['fame', box(500)],
      ['bartender', box(1000)],
      ['door', box(100)],
    ]);
    const fame = content.rooms.pub!.hotspots.find((h) => h.id === 'fame')!;
    const look = fame.interactions.find((i) => i.verb === 'look')!.effects[0] as { say: string };

    expect(snapshotThings(content, allHold, inRoom('pub'), boxes, 'Paws Anka')).toEqual([
      { key: 'door', name: 'Street door', description: '', kind: 'scene', box: box(100) },
      { key: 'bartender', name: 'Bartender', description: '', kind: 'character', box: box(1000) },
      { key: 'fame', name: fame.name, description: look.say, kind: 'scene', box: box(500) },
    ]);
  });

  it('describe a hotspot by the look whose conditions hold in the room as captured', async () => {
    const { snapshotThings }: Script = await import(/* @vite-ignore */ SCRIPT);
    const boxes = new Map([['intercom', box(800)]]);
    const description = (state: GameState) =>
      snapshotThings(content, allHold, state, boxes, 'Paws Anka').map((thing) => thing.description);
    const fresh = inRoom('high-street');

    expect(description(fresh)).toEqual(['A buzzer marked "S.M.". Whoever that is.']);
    expect(description({ ...fresh, flags: { 'song-stolen': true } })).toEqual([
      'I buzz. And buzz. Nobody answers any more.',
    ]);
  });

  it('map only rooms there are', () => {
    for (const room of Object.keys(locations)) expect(Object.keys(content.rooms), room).toContain(room);
  });
});
