import { expect, test } from './fixtures';
import {
  clickScene,
  content,
  enterPub,
  game,
  hotspot,
  inventoryItem,
  isThreeD,
  newGame,
  playerPosition,
  scenePixel,
  useItemOn,
} from './play';

// Acceptance tests for openspec/specs/inventory/spec.md.

test.use({ actionTimeout: 5_000 });

test('Picking up', async ({ page }) => {
  test.fail(isThreeD(), 'needs B3: the flyer is drawn where its 2D sprite is');
  // Requirement: Picking up items. Items can be picked up from rooms into the inventory.
  await newGame(page);
  await expect.poll(() => playerPosition(page)).not.toBeNull();
  const flyer = await scenePixel(page, content.flyerSprite);
  await hotspot(page, content.flyer).click();
  await expect(hotspot(page, content.flyer)).toHaveCount(0);
  await expect(inventoryItem(page, content.flyer)).toBeVisible();
  // The flyer leaves the room's art too, not just its hotspot.
  await clickScene(page, content.pavement);
  await expect
    .poll(async () => {
      const at = await playerPosition(page);
      return at && Math.hypot(at.x - content.pavement.x, at.y - content.pavement.y);
    })
    .toBeLessThan(24);
  expect(await scenePixel(page, content.flyerSprite)).not.toEqual(flyer);
});

test('A use that works', async ({ page }) => {
  // Requirement: Using items. Using an item on a hotspot that accepts it runs the puzzle step.
  // The step here is an Act 1 placeholder: the bartender takes the Open Mic flyer.
  await newGame(page);
  await hotspot(page, content.flyer).click();
  await enterPub(page);
  await useItemOn(page, content.flyer, content.bartender);
  await expect(inventoryItem(page, content.flyer)).toHaveCount(0);
});

test('A use that does not work', async ({ page }) => {
  // Requirement: Using items. The game responds even when the use does nothing.
  await newGame(page);
  await useItemOn(page, content.brokenGuitar, content.pubDoor);
  await expect(game(page)).toHaveAttribute('data-say', /\S/);
  await expect(game(page)).toHaveAttribute('data-scene', content.opening);
  await expect(inventoryItem(page, content.brokenGuitar)).toBeVisible();
});

test('New game', async ({ page }) => {
  // Requirement: Starting inventory. A new game starts with the broken guitar in the inventory.
  await newGame(page);
  await expect(inventoryItem(page, content.brokenGuitar)).toBeVisible();
});
