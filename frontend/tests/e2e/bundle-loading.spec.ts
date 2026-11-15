import type { Page } from '@playwright/test';
import { validateContent } from '../../src/content/validate';
import { expect, test } from './fixtures';
import {
  type Bundle,
  SUPPORTED_SCHEMA,
  bundleProblem,
  bundleUrl,
  clickHotspot,
  content,
  enterPub,
  game,
  manifest,
  newGame,
  playerPosition,
  seedSave,
  serveBundle,
  toOutsidePub,
  tuneStoryBundle,
} from './play';

// Acceptance tests for openspec/specs/bundle-loading/spec.md (spec change #141). Each scenario is
// expected to fail until #143 builds bundle loading; the interface they assume is in play.ts.
// The first test is not a scenario: it checks the bundles the scenarios serve, and is expected
// to pass, so a broken fixture is not hidden behind an expected failure.

type Json = Record<string, any>;

/**
 * A small second game, The Lighthouse: one world, one room on the jetty with a tide table to
 * look at. Its room is laid out on the coach station's scene model, whose bytes it serves as
 * its own, so its floor and its hit_board node are real. `edit` changes its files before the
 * manifest lists them; `extra` adds fields to the manifest.
 */
function lighthouse(edit?: (json: Json) => void, extra: Json = {}, version = `${SUPPORTED_SCHEMA.major}.${SUPPORTED_SCHEMA.minor}`): Bundle {
  const station = tuneStoryBundle().json['content/rooms/coach-station.json'] as Json;
  const board = station.hotspots.find((spot: Json) => spot.id === 'board');
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
  return {
    manifest: manifest('lighthouse', 'The Lighthouse', version, 'island', json, extra),
    json,
    models: {
      'models/scenes/jetty.glb': 'models/scenes/coach-station.glb',
      'models/characters/protagonist.glb': 'models/characters/protagonist.glb',
    },
  };
}

/** New game, offered as a button the player can press. */
const offeredNewGame = (page: Page) => page.getByRole('button', { name: 'New game', disabled: false });

test('The bundles the scenarios serve hold together', async ({ page }) => {
  await page.goto('/');
  for (const [name, bundle] of [
    ['tune-story', tuneStoryBundle()],
    ['lighthouse', lighthouse()],
  ] as const) {
    expect(validateContent(bundle.json), name).toEqual([]);
    const registry = (bundle.json['assets/models.json'] as Json).models as Json[];
    expect(Object.keys(bundle.models).sort(), name).toEqual(registry.map((m) => m.model3d.file).sort());
    expect(bundle.manifest.files, name).toEqual(Object.keys(bundle.json).sort());
    const worlds = (bundle.json['content/worlds.json'] as Json).worlds as Json[];
    expect(bundle.manifest.world, name).toBe(worlds[0]!.id);

    const served = await serveBundle(page, name, bundle);
    const paths = ['manifest.json', ...Object.keys(bundle.json), ...Object.keys(bundle.models)];
    const statuses = await page.evaluate(
      ({ root, paths }) => Promise.all(paths.map((path) => fetch(root + path).then((r) => r.status))),
      { root: `/bundles/${name}/`, paths },
    );
    expect(statuses, name).toEqual(paths.map(() => 200));
    expect(served.sort(), name).toEqual([...paths].sort());
  }
});

test('Playing an exported bundle', async ({ page }) => {
  test.fail(true, 'needs #143');
  // Requirement: Loading a bundle. The game SHALL load its worlds, rooms, items, characters,
  // objects, stats, acts, model registry and character sheets from a bundle named by a
  // manifest, and play it.
  test.slow();
  const served = await serveBundle(page, 'tune-story', tuneStoryBundle());
  await newGame(page, bundleUrl('tune-story'));
  expect(served).toEqual(
    expect.arrayContaining(['manifest.json', 'content/worlds.json', 'content/rooms/coach-station.json']),
  );
  await toOutsidePub(page);
  await enterPub(page);
});

test('An unsupported major version', async ({ page }) => {
  test.fail(true, 'needs #143');
  // Requirement: Manifest and schema version. The game MUST refuse a bundle whose major schema
  // version it does not support, and say which version it needs.
  const unsupported = SUPPORTED_SCHEMA.major + 1;
  await serveBundle(page, 'lighthouse', lighthouse(undefined, {}, `${unsupported}.0`));
  await page.goto(bundleUrl('lighthouse'));
  await expect(bundleProblem(page)).toContainText(new RegExp(`\\b${unsupported}\\b`));
  await expect(bundleProblem(page)).toContainText(new RegExp(`\\b${SUPPORTED_SCHEMA.major}\\b`));
  await expect(offeredNewGame(page)).toBeHidden();
  await expect(game(page)).not.toHaveAttribute('data-scene', /\S/);
});

test('A newer minor version', async ({ page }) => {
  test.fail(true, 'needs #143');
  // Requirement: Manifest and schema version. The bundle's manifest SHALL name the game and the
  // schema version of its files.
  const newer = `${SUPPORTED_SCHEMA.major}.${SUPPORTED_SCHEMA.minor + 1}`;
  const bundle = lighthouse(
    (json) => {
      json['content/rooms/jetty.json'].mood = 'rainy';
      json['content/items.json'].items.lamp.colour = 'brass';
    },
    { credits: 'Made in Annie' },
    newer,
  );
  await serveBundle(page, 'lighthouse', bundle);
  await page.goto(bundleUrl('lighthouse'));
  await page.getByRole('button', { name: 'New game' }).click();
  await expect(game(page)).toHaveAttribute('data-scene', 'jetty');
  await expect(bundleProblem(page)).toBeHidden();
});

test('A broken bundle', async ({ page }) => {
  test.fail(true, 'needs #143');
  // Requirement: Checked before playing. A bundle MUST be checked with the same validators as
  // content kept in the repository, and any problem MUST be listed with its file and field
  // before anything is played.
  const broken = lighthouse((json) =>
    json['content/rooms/jetty.json'].hotspots[0].interactions.push({
      verb: 'use',
      item: 'no-such-item',
      effects: [{ say: 'Nothing.' }],
    }),
  );
  await serveBundle(page, 'lighthouse', broken);
  await page.goto(bundleUrl('lighthouse'));
  await expect(bundleProblem(page)).toContainText('rooms/jetty.json');
  await expect(bundleProblem(page)).toContainText('hotspots[0].interactions[1].item');
  await expect(offeredNewGame(page)).toBeHidden();
  await expect(game(page)).not.toHaveAttribute('data-scene', /\S/);
});

test('A different game', async ({ page }) => {
  test.fail(true, 'needs #143');
  // Requirement: No game content in the engine. The engine's code SHALL not depend on the
  // content of any one game, and a bundle for a different game MUST play with no code change.
  await serveBundle(page, 'lighthouse', lighthouse());
  await page.goto(bundleUrl('lighthouse'));
  await page.getByRole('button', { name: 'New game' }).click();
  await expect(game(page)).toHaveAttribute('data-scene', 'jetty');
  await expect(game(page)).toHaveAttribute('data-world', 'island');
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect.poll(() => playerPosition(page)).not.toBeNull();
  await clickHotspot(page, /tide table/i);
  await expect(game(page)).toHaveAttribute('data-say', 'High tide at nine.');
});

test('A save from another game', async ({ page }) => {
  test.fail(true, 'needs #143');
  // Requirement: Saves belong to a game. A save SHALL record which game it was made for. The
  // game MUST NOT load a save made for a different game, and MUST say so instead of loading a
  // wrong state.
  // A save without a gameId still loads as the current game: title.spec.ts and every seedSave
  // test cover that.
  await seedSave(page, {
    room: content.highStreet,
    act: '1',
    goals: [],
    stats: content.newStats,
    flags: { arrived: true },
    gameId: 'another-game',
  });
  await page.goto('/');
  const continueButton = page.getByRole('button', { name: 'Continue' });
  const offered = await expect(continueButton)
    .toBeVisible({ timeout: 5_000 })
    .then(
      () => true,
      () => false,
    );
  if (offered) {
    await continueButton.click();
    const newGameStarted = page.locator(`#game[data-scene="${content.coachStation}"]`);
    await expect(newGameStarted.or(bundleProblem(page)).first()).toBeVisible();
  } else {
    await page.getByRole('button', { name: 'New game' }).click();
    await expect(game(page)).toHaveAttribute('data-scene', content.coachStation);
  }
  await expect(game(page)).not.toHaveAttribute('data-scene', content.highStreet);
});
