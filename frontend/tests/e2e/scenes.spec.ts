import { inflateSync } from 'node:zlib';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { clickScene, content, enterPub, game, hotspot, newGame, playerPosition } from './play';

// Acceptance tests for openspec/specs/scenes/spec.md.

test.use({ actionTimeout: 5_000 });

test('Opening scene', async ({ page }) => {
  // Requirement: Rooms. The game shows one room at a time, with the player character in it.
  await newGame(page);
  await expect.poll(() => playerPosition(page)).not.toBeNull();
  await expect(hotspot(page, content.pubDoor)).toBeAttached();
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
  const door = hotspot(page, content.pubDoor);
  await door.hover();
  await expect(game(page)).toHaveAttribute('data-hover', content.pubDoor);
});

test('Clicking a hotspot', async ({ page }) => {
  // Requirement: Hotspots. Clicking one walks the character to it and its action happens.
  await newGame(page);
  const start = await playerPosition(page);
  await hotspot(page, content.board).click();
  await expect(game(page)).toHaveAttribute('data-say', /\S/);
  expect(await playerPosition(page)).not.toEqual(start);
});

test('Entering the pub', async ({ page }) => {
  // Requirement: Exits. Clicking the pub door in the opening scene enters the pub interior.
  await newGame(page);
  await enterPub(page);
});

test('Swapping art', async ({ page }) => {
  // Requirement: Placeholder art. Replacing a room's art file needs no change to game logic.
  const magenta = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="2560" height="1280">',
    '<rect width="100%" height="100%" fill="#FF00FF"/></svg>',
  ].join('');
  await page.route('**/rooms/opening/background.jpg', (route) =>
    route.fulfill({ status: 200, contentType: 'image/svg+xml', body: magenta }),
  );
  await newGame(page);
  await expect.poll(() => scenePixel(page, { x: 40, y: 300 })).toEqual([255, 0, 255]);
  await hotspot(page, content.pubDoor).hover();
  await expect(game(page)).toHaveAttribute('data-hover', content.pubDoor);
  await enterPub(page);
});

/** The colour the canvas shows at scene pixels, read from a 1 x 1 screenshot. */
async function scenePixel(page: Page, at: { x: number; y: number }): Promise<number[]> {
  const box = await page.locator('#game canvas').boundingBox();
  if (!box) throw new Error('no game canvas');
  const scale = box.width / 1280;
  const clip = { x: box.x + at.x * scale, y: box.y + at.y * scale, width: 1, height: 1 };
  const png = await page.screenshot({ clip });
  return [...firstPixel(png)];
}

// A one-pixel PNG has a single scanline, and every PNG filter leaves its first pixel as is.
function firstPixel(png: Buffer): Buffer {
  const idat: Buffer[] = [];
  for (let at = 8; at < png.length; ) {
    const length = png.readUInt32BE(at);
    if (png.toString('ascii', at + 4, at + 8) === 'IDAT') idat.push(png.subarray(at + 8, at + 8 + length));
    at += length + 12;
  }
  return inflateSync(Buffer.concat(idat)).subarray(1, 4);
}
