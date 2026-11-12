import { expect, test } from './fixtures';
import {
  clickHotspot,
  clickScene,
  content,
  continueGame,
  game,
  goal,
  hotspot,
  inventoryItem,
  newGame,
  playerPosition,
  scenePixel,
  seedSave,
  startOutsidePub,
  toHighStreet,
  useItemOn,
  useItemOnItem,
} from './play';

// Acceptance tests for openspec/specs/inventory/spec.md.

test.use({ actionTimeout: 5_000 });

test('Picking up', async ({ page }) => {
  // Requirement: Picking up items. Items can be picked up from rooms into the inventory.
  await startOutsidePub(page);
  await toHighStreet(page);
  await expect.poll(() => playerPosition(page)).not.toBeNull();
  const flyer = await scenePixel(page, content.lessonFlyerSprite);
  await clickHotspot(page, content.lessonFlyer);
  await expect(hotspot(page, content.lessonFlyer)).toHaveCount(0);
  await expect(inventoryItem(page, content.lessonFlyer)).toBeVisible();
  // The flyer leaves the room's art too, not just its hotspot.
  const pavement = content.highStreetPavement;
  await clickScene(page, pavement);
  await expect
    .poll(async () => {
      const at = await playerPosition(page);
      return at && Math.hypot(at.x - pavement.x, at.y - pavement.y);
    })
    .toBeLessThan(24);
  expect(await scenePixel(page, content.lessonFlyerSprite)).not.toEqual(flyer);
});

test('A use that works', async ({ page }) => {
  // Requirement: Using items. Using an item on a hotspot that accepts it runs the puzzle step:
  // shown the working guitar, Sheryl Caw agrees.
  await seedSave(page, {
    room: 'pub',
    act: '1',
    goals: [],
    stats: content.newStats,
    inventory: { items: ['broken-guitar', 'guitar'], pickedUp: [] },
  });
  await continueGame(page);
  await expect(goal(page, /working guitar/i)).not.toBeChecked();
  await useItemOn(page, content.guitar, content.sherylCaw);
  await expect(goal(page, /working guitar/i)).toBeChecked();
});

test('Using an item on another item', async ({ page }) => {
  // Requirement: Using items. Using an item on an inventory item that accepts it runs the
  // puzzle step: the Mayor's mane string on the broken guitar gives a working guitar.
  const flags = { 'string-sold-out': true };
  await seedSave(page, { room: 'mayors-office', act: '1', goals: [], stats: content.newStats, flags });
  await continueGame(page);
  await clickHotspot(page, content.mayor);
  await expect(inventoryItem(page, content.maneString)).toBeVisible();
  await useItemOnItem(page, content.maneString, content.brokenGuitar);
  await expect(inventoryItem(page, content.guitar)).toBeVisible();
  await expect(inventoryItem(page, content.brokenGuitar)).toHaveCount(0);
  await expect(inventoryItem(page, content.maneString)).toHaveCount(0);
});

test('A use that does not work', async ({ page }) => {
  // Requirement: Using items. The game responds even when the use does nothing.
  await startOutsidePub(page);
  await useItemOn(page, content.brokenGuitar, content.pubDoor);
  await expect(game(page)).toHaveAttribute('data-say', /\S/);
  await expect(game(page)).toHaveAttribute('data-scene', content.opening);
  await expect(inventoryItem(page, content.brokenGuitar)).toBeVisible();
});

test('Using the map', async ({ page }) => {
  // Requirement: Using items. The map, picked up at the coach station, is used on its own: the
  // Map opens.
  await newGame(page);
  await clickHotspot(page, content.mapStand);
  await inventoryItem(page, content.mapItem).click();
  await expect(game(page)).toHaveAttribute('data-scene', content.map);
});

test('Two items that do not go together', async ({ page }) => {
  // Requirement: Using items. An item used on an inventory item that does not accept it
  // selects that item instead: the flyer does nothing for the broken guitar.
  await startOutsidePub(page);
  await toHighStreet(page);
  await clickHotspot(page, content.lessonFlyer);
  await useItemOnItem(page, content.lessonFlyer, content.brokenGuitar);
  await expect(inventoryItem(page, content.brokenGuitar)).toHaveAttribute('aria-pressed', 'true');
  await expect(inventoryItem(page, content.lessonFlyer)).toHaveAttribute('aria-pressed', 'false');
});

test('New game', async ({ page }) => {
  // Requirement: Starting inventory. A new game starts with the broken guitar in the inventory.
  await newGame(page);
  await expect(inventoryItem(page, content.brokenGuitar)).toBeVisible();
});
