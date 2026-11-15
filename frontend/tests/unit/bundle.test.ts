import { describe, expect, it, vi } from 'vitest';
import { builtInGame, dialogueFor, loadBundle } from '../../src/app/games';
import { readManifest, SUPPORTED_SCHEMA } from '../../src/content';
import type { RoomId } from '../../src/domain';
import { fakeFetch, lighthouse, MANIFEST_URL, SITE } from './fixtures/bundle';

// Bundle loading (openspec/specs/bundle-loading): a game from a bundle is checked like the
// built-in one before it plays, and refused with its problems listed, never thrown.

const load = (files: ReturnType<typeof lighthouse>, manifest = MANIFEST_URL) => {
  const fetch = fakeFetch(files);
  return { fetch, loaded: loadBundle(new URL(manifest), new URL(SITE), fetch) };
};

describe('the manifest', () => {
  const manifest = { game: 'g', name: 'G', files: [] };

  it('plays any minor version of the supported major', () => {
    expect(readManifest({ ...manifest, schemaVersion: `${SUPPORTED_SCHEMA.major}.9`, credits: 'x' }).issues).toEqual([]);
  });

  it('refuses another major, naming both versions', () => {
    expect(readManifest({ ...manifest, schemaVersion: '2.0' }).issues).toEqual([
      { file: 'manifest.json', field: 'schemaVersion', message: 'is 2.0, and this game plays schema version 1.x only' },
    ]);
  });

  it('refuses a manifest without a game, a name, a version or its files', () => {
    expect(readManifest({}).issues.map((issue) => issue.field)).toEqual(['game', 'name', 'schemaVersion', 'files']);
  });
});

describe('loading a bundle', () => {
  it('loads a second game, checked, with its own registry', async () => {
    const result = await load(lighthouse()).loaded;
    if (!('game' in result)) throw new Error(result.problems.join('\n'));
    expect(result.game.id).toBe('lighthouse');
    expect(result.game.name).toBe('The Lighthouse');
    expect(result.game.content.start.room).toBe('jetty');
    expect(Object.keys(result.game.registry)).toEqual(['scene/jetty', 'character/protagonist']);
  });

  it('refuses an unsupported major version having fetched only the manifest', async () => {
    const { fetch, loaded } = load(lighthouse(undefined, '2.0'));
    expect(await loaded).toEqual({
      problems: ['manifest.json schemaVersion: is 2.0, and this game plays schema version 1.x only'],
    });
    expect(fetch.asked).toEqual([MANIFEST_URL]);
  });

  it('lists a broken file by its file and field', async () => {
    const broken = lighthouse((json) =>
      json['content/rooms/jetty.json'].hotspots[0].interactions.push({
        verb: 'use',
        item: 'no-such-item',
        effects: [{ say: 'Nothing.' }],
      }),
    );
    expect(await load(broken).loaded).toEqual({
      problems: ['content/rooms/jetty.json hotspots[0].interactions[1].item: "no-such-item" is not a known item'],
    });
  });

  it('checks its models against the asset contract', async () => {
    const files = lighthouse();
    files.delete(`${SITE}models/scenes/jetty.glb`);
    const result = await load(files).loaded;
    expect('problems' in result && result.problems.some((p) => p.startsWith('assets/models.json'))).toBe(true);
  });

  it('refuses a manifest on another site', async () => {
    const { fetch, loaded } = load(lighthouse(), 'https://elsewhere.test/bundles/lighthouse/manifest.json');
    expect(await loaded).toEqual({
      problems: ['https://elsewhere.test/bundles/lighthouse/manifest.json: is not on this site'],
    });
    expect(fetch.asked).toEqual([]);
  });

  it('lists a file it cannot fetch rather than throwing', async () => {
    const files = lighthouse();
    files.delete(new URL('content/items.json', MANIFEST_URL).href);
    expect(await load(files).loaded).toEqual({ problems: ['content/items.json: could not be loaded (404)'] });
  });

  it('lists a file that is not JSON rather than throwing', async () => {
    const files = lighthouse();
    const items = new URL('content/items.json', MANIFEST_URL).href;
    const fetch = fakeFetch(files);
    const notJson = async (input: RequestInfo | URL) =>
      String(input) === items ? new Response('<html>') : fetch(input);
    expect(await loadBundle(new URL(MANIFEST_URL), new URL(SITE), notJson)).toEqual({
      problems: ['content/items.json: is not JSON'],
    });
  });

  it('lists a model path that is not an address rather than throwing', async () => {
    const result = await load(
      lighthouse((json) => (json['assets/models.json'].models[0].model3d.file = 'http://[x.glb')),
    ).loaded;
    expect('problems' in result && result.problems.some((p) => p.includes('model3d.file'))).toBe(true);
  });

  it('fetches no model from another site', async () => {
    const elsewhere = 'https://elsewhere.test/jetty.glb';
    const { fetch, loaded } = load(
      lighthouse((json) => (json['assets/models.json'].models[0].model3d.file = elsewhere)),
    );
    const result = await loaded;
    expect('problems' in result && result.problems.some((p) => p.includes('model3d.file'))).toBe(true);
    expect(fetch.asked).not.toContain(elsewhere);
  });

  it('names its protagonist with its own name', async () => {
    const result = await load(
      lighthouse((json) => {
        json['content/characters.json'].protagonist.name = 'Gull';
        json['content/rooms/jetty.json'].hint = "{protagonist}'s jetty.";
      }),
    ).loaded;
    if (!('game' in result)) throw new Error(result.problems.join('\n'));
    expect(result.game.content.protagonist.name).toBe('Gull');
    expect(result.game.content.rooms['jetty' as RoomId]?.hint).toBe("Gull's jetty.");
  });
});

describe('the built-in game', () => {
  it('is Tune Story, whose saves a Tune Story bundle continues', () => {
    expect(builtInGame()).toMatchObject({ id: 'tune-story', name: 'Tune Story' });
  });
});

describe('who answers a game\'s characters', () => {
  const backend = { turn: vi.fn(async () => null) };

  it('is the backend, whose character sheets are Tune Story\'s, for Tune Story', () => {
    expect(dialogueFor(builtInGame().id, backend)).toBe(backend);
  });

  it('is no one for another game, so its characters never reach a Tune Story sheet', async () => {
    expect(await dialogueFor('lighthouse', backend).turn('bartender', null, [])).toBeNull();
    expect(backend.turn).not.toHaveBeenCalled();
  });
});
