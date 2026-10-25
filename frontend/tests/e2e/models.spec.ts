import { fixtures } from '../fixtures/models/glb';
import { expect, test } from './fixtures';
import {
  clickHotspot,
  clickScene,
  content,
  game,
  newGame,
  openingSceneModel,
  playerPosition,
  pointAtHotspot,
} from './play';

// Acceptance tests for openspec/specs/models/spec.md that the player can see, with the 3D
// renderer. The registry and the asset contract are unit tests (tests/unit/models.acceptance.test.ts).

test.use({ actionTimeout: 5_000 });

const protagonistModel = '/models/characters/paws.glb';

test('Opening scene in 3D', async ({ page }) => {
  test.fail(true, 'needs #38');
  // Requirement: 3D rooms. Rooms are drawn in 3D from their scene model, with the player
  // character's model standing on the floor.
  const loaded: string[] = [];
  page.on('response', (response) => {
    if (response.ok()) loaded.push(new URL(response.url()).pathname);
  });
  await newGame(page, '3d');
  await expect.poll(() => loaded).toEqual(expect.arrayContaining([openingSceneModel, protagonistModel]));
  const webgl = await page
    .locator('#game canvas')
    .evaluate((canvas: HTMLCanvasElement) => !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl')));
  expect(webgl).toBe(true);
  await expect.poll(() => playerPosition(page)).not.toBeNull();
});

test('Replacing a placeholder', async ({ page }) => {
  test.fail(true, 'needs #38');
  // Requirement: Placeholder models. A placeholder replaced by a model that follows the contract
  // shows the new model, with no code or content change, and hotspots and exits still work.
  let replaced = false;
  await page.route(`**${protagonistModel}`, (route) => {
    replaced = true;
    return route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: Buffer.from(fixtures.character()) });
  });
  await newGame(page, '3d');
  await expect.poll(() => replaced).toBe(true);
  await clickHotspot(page, content.pubDoor);
  await expect(game(page)).toHaveAttribute('data-scene', content.pubInterior);
  await clickHotspot(page, content.bartender);
  await expect(game(page)).toHaveAttribute('data-say', /\S/);
});

test('Hovering a model', async ({ page }) => {
  test.fail(true, 'needs #39');
  // Requirement: Picking in 3D. The pointer over an entity's model or hit area hovers its hotspot.
  await newGame(page, '3d');
  await pointAtHotspot(page, content.pubDoor);
  await expect(game(page)).toHaveAttribute('data-hover', content.pubDoor);
});

test('Clicking a model', async ({ page }) => {
  test.fail(true, 'needs #39');
  // Requirement: Picking in 3D. A click on a hotspot's model walks the character to it and
  // activates the hotspot.
  await newGame(page, '3d');
  const start = await playerPosition(page);
  await clickHotspot(page, content.board);
  await expect(game(page)).toHaveAttribute('data-say', /\S/);
  expect(await playerPosition(page)).not.toEqual(start);
});

test('Walking on a 3D floor', async ({ page }) => {
  test.fail(true, 'needs #39');
  // Requirement: Picking in 3D. A click on the floor walks the player there.
  await newGame(page, '3d');
  await clickScene(page, content.pavement);
  await expect
    .poll(async () => {
      const at = await playerPosition(page);
      return at && Math.hypot(at.x - content.pavement.x, at.y - content.pavement.y);
    })
    .toBeLessThan(24);
});

test('Walking animation', async ({ page }) => {
  test.fail(true, 'needs #40');
  // Requirement: Character animation. The player character plays its walk animation while it
  // walks and idle once it stops, mirrored on #game as data-player-animation.
  await newGame(page, '3d');
  await clickScene(page, content.pavement);
  await expect(game(page)).toHaveAttribute('data-player-animation', 'walk');
  await expect(game(page)).toHaveAttribute('data-player-animation', 'idle');
});
