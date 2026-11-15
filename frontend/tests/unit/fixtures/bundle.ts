import station from '../../../src/content/rooms/coach-station.json';
import { modelFiles } from '../support/files';

// The Lighthouse, a small second game as a bundle (the same one the bundle-loading e2e tests
// serve): one world, one room on the jetty with a tide table to look at. The room is laid out on
// the coach station's scene model, whose bytes it serves as its own, so its floor and hit_board
// node are real.

type Json = Record<string, any>;

export const SITE = 'https://punland.test/';
export const MANIFEST_URL = `${SITE}bundles/lighthouse/manifest.json`;

/** Bundle files by their URL; `edit` changes the bundle's files before the manifest lists them. */
export function lighthouse(edit?: (json: Json) => void, version = '1.0'): Map<string, Json | Uint8Array> {
  const board = station.hotspots.find((spot) => spot.id === 'board');
  const json: Json = {
    'content/worlds.json': { worlds: [{ id: 'island', name: 'Island', start: 'jetty' }] },
    'content/items.json': { start: [], items: { lamp: { name: 'Lamp', noUse: 'Not the lamp.' } } },
    'content/characters.json': { protagonist: { model: 'character/protagonist' }, characters: [] },
    'content/objects.json': { objects: [] },
    'content/stats.json': { stats: [] },
    'content/acts.json': { acts: [{ id: 'one', name: 'Chapter One', goals: [{ id: 'light', name: 'Light the lamp' }] }] },
    'content/rooms/jetty.json': {
      model: 'scene/jetty',
      world: 'island',
      label: 'THE JETTY',
      place: { verb: 'On', name: 'the jetty' },
      hint: 'Look around.',
      start: station.start,
      walkable: station.walkable,
      hotspots: [
        { ...board, name: 'Tide table', interactions: [{ verb: 'look', effects: [{ say: 'High tide at nine.' }] }] },
      ],
    },
    'assets/models.json': {
      models: [
        { id: 'scene/jetty', kind: 'scene', model3d: { file: 'models/scenes/jetty.glb', placeholder: false } },
        {
          id: 'character/protagonist',
          kind: 'character',
          model3d: { file: 'models/characters/protagonist.glb', placeholder: false },
        },
      ],
    },
  };
  edit?.(json);
  const manifest = { game: 'lighthouse', name: 'The Lighthouse', schemaVersion: version, files: Object.keys(json) };
  return new Map<string, Json | Uint8Array>([
    [MANIFEST_URL, manifest],
    ...Object.entries(json).map(([file, data]) => [new URL(file, MANIFEST_URL).href, data] as const),
    [`${SITE}models/scenes/jetty.glb`, modelFiles['models/scenes/coach-station.glb']!],
    [`${SITE}models/characters/protagonist.glb`, modelFiles['models/characters/protagonist.glb']!],
  ]);
}

/** A fetch that serves `files` by URL, and 404 for anything else; `asked` lists the URLs asked for. */
export function fakeFetch(files: Map<string, Json | Uint8Array>): typeof globalThis.fetch & { asked: string[] } {
  const asked: string[] = [];
  const fetch = async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    asked.push(url);
    const file = files.get(url);
    if (file === undefined) return new Response('', { status: 404 });
    return new Response(file instanceof Uint8Array ? file.slice().buffer : JSON.stringify(file));
  };
  return Object.assign(fetch, { asked });
}
