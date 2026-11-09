import { expect, test } from './fixtures';
import { fixtures } from '../fixtures/models/glb';
import {
  clickHotspot,
  clickScene,
  content,
  enterPub,
  game,
  hotspot,
  conversation,
  newGame,
  openingSceneModel,
  playerPosition,
  pointAtHotspot,
  scenePixel,
  stubDialogue,
  toHighStreet,
} from './play';

// Acceptance tests for openspec/specs/scenes/spec.md.

test.use({ actionTimeout: 5_000 });

test('Opening scene', async ({ page }) => {
  // Requirement: Rooms. The game shows one room at a time, with the player character in it,
  // and the first character there to talk to is the beetroot cop.
  const asked: unknown[] = [];
  await stubDialogue(page, (body) => {
    asked.push(body);
    return { line: 'All the music stars go to The Three Crows.', options: [], goal_reached: false, ended: true };
  });
  await newGame(page);
  await expect.poll(() => playerPosition(page)).not.toBeNull();
  await expect(hotspot(page, content.pubDoor)).toBeAttached();
  await clickHotspot(page, content.cop);
  await expect(conversation(page)).toHaveAccessibleName(content.cop);
  await expect(conversation(page)).toContainText('The Three Crows');
  expect(asked).toEqual([{ character: 'cop', reply: null }]);
});

test('Walking', async ({ page }) => {
  // Requirement: Click to walk. The player character walks to the point clicked on the floor.
  await newGame(page);
  await clickScene(page, content.pavement);
  await expect
    .poll(async () => {
      const at = await playerPosition(page);
      return at && Math.hypot(at.x - content.pavement.x, at.y - content.pavement.y);
    })
    .toBeLessThan(24);
});

test('Hovering a hotspot', async ({ page }) => {
  // Requirement: Hotspots. Hotspots show their name on hover.
  await newGame(page);
  await pointAtHotspot(page, content.pubDoor);
  await expect(game(page)).toHaveAttribute('data-hover', content.pubDoor);
});

test('Clicking a hotspot', async ({ page }) => {
  // Requirement: Hotspots. Clicking one walks the character to it and its action happens.
  await newGame(page);
  const start = await playerPosition(page);
  await clickHotspot(page, content.board);
  await expect(game(page)).toHaveAttribute('data-say', /\S/);
  expect(await playerPosition(page)).not.toEqual(start);
});

test('Entering the pub', async ({ page }) => {
  // Requirement: Exits. Clicking the pub door in the opening scene enters the pub interior.
  await newGame(page);
  await enterPub(page);
  await expect.poll(() => playerPosition(page)).toEqual(content.pubEntrance);
  await clickHotspot(page, content.pubDoor);
  await expect(game(page)).toHaveAttribute('data-scene', content.opening);
  await expect.poll(() => playerPosition(page)).toEqual(content.outsidePub);
});

test('Down the High Street', async ({ page }) => {
  // Requirement: Exits. The way down the High Street from the opening scene shows the High
  // Street, with the music shop, the Song Master's flyer and his intercom.
  await newGame(page);
  await toHighStreet(page);
  for (const name of [content.musicShop, content.lessonFlyer, content.intercom]) {
    await expect(hotspot(page, name)).toBeAttached();
  }
  await clickHotspot(page, content.backToPub);
  await expect(game(page)).toHaveAttribute('data-scene', content.opening);
});

test('Looking at the Wall of Fame', async ({ page }) => {
  // Requirement: The Three Crows. The pub's Wall of Fame has its visual-pun photos.
  await newGame(page);
  await enterPub(page);
  for (const name of [content.sherylCaw, content.secondCrow, content.thirdCrow, /stage/i]) {
    await expect(hotspot(page, name)).toBeAttached();
  }
  await clickHotspot(page, content.wallOfFame);
  for (const photo of [/pile of rocks/, /Beetles/, /Tuna and Pike Turner/, /Katty Purry/]) {
    await expect(game(page)).toHaveAttribute('data-say', photo);
  }
});

test('Swapping art (scene model)', async ({ page }) => {
  // Requirement: Placeholder art. Replacing a room's scene model needs no change to game logic.
  await page.route(`**${openingSceneModel}`, (route) =>
    route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: Buffer.from(fixtures.magentaScene()) }),
  );
  await newGame(page);
  // The toon ramp gives the backdrop two tones and the grain overlay sits above the canvas, so
  // the pixel is strongly magenta rather than exactly #FF00FF.
  await expect
    .poll(async () => {
      const [r = 0, g = 255, b = 0] = await scenePixel(page, { x: 40, y: 300 });
      return r > 150 && b > 150 && g < 80;
    })
    .toBe(true);
  await pointAtHotspot(page, content.pubDoor);
  await expect(game(page)).toHaveAttribute('data-hover', content.pubDoor);
  await clickHotspot(page, content.pubDoor);
  await expect(game(page)).toHaveAttribute('data-scene', content.pubInterior);
});
