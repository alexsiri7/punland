import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { content, game, hotspot, inventoryItem, newGame, worlds } from './play';

// Acceptance tests for openspec/specs/worlds/spec.md.

test.use({ actionTimeout: 5_000 });

/** The Online and Dream buttons the player can choose right now. */
async function unlockedOtherWorlds(page: Page): Promise<Locator[]> {
  const unlocked: Locator[] = [];
  for (const name of ['Online', 'Dream']) {
    const button = worlds(page).getByRole('button', { name });
    if (await button.isEnabled()) unlocked.push(button);
  }
  return unlocked;
}

test('Switching', async ({ page }) => {
  // Requirement: Switching worlds. The player can switch to any unlocked world.
  await newGame(page);
  await expect(worlds(page).getByRole('button', { name: 'Street' })).toBeVisible();
  await expect(game(page)).toHaveAttribute('data-world', 'street');
  const [other] = await unlockedOtherWorlds(page);
  expect(other, 'an unlocked world besides the street').toBeDefined();
  const name = (await other.textContent())?.trim().toLowerCase();
  await other.click();
  await expect(game(page)).toHaveAttribute('data-world', name ?? '');
  await expect(game(page)).not.toHaveAttribute('data-scene', content.opening);
  await worlds(page).getByRole('button', { name: 'Street' }).click();
  await expect(game(page)).toHaveAttribute('data-world', 'street');
});

test('Locked world', async ({ page }) => {
  // Requirement: Switching worlds. A locked world is shown as locked and cannot be entered.
  await newGame(page);
  const locked = worlds(page).getByRole('button', { disabled: true });
  await expect(locked.first()).toBeVisible();
  await expect(locked.first()).toHaveAccessibleDescription(/locked/i);
  await locked.first().click({ force: true });
  await expect(game(page)).toHaveAttribute('data-world', 'street');
  await expect(game(page)).toHaveAttribute('data-scene', content.opening);
});

test('Something done in the street turns up in the dream', async ({ page }) => {
  // Requirement: Things cross worlds. In the Act 1 placeholder content, picking up the Open
  // Mic flyer is dream material.
  await newGame(page);
  await hotspot(page, content.flyer).click();
  // The cat walks to the flyer first; switching worlds on the way would call the pickup off.
  await expect(inventoryItem(page, content.flyer)).toBeVisible();
  await worlds(page).getByRole('button', { name: 'Dream' }).click();
  await expect(game(page)).toHaveAttribute('data-world', 'dream');
  await hotspot(page, content.flyer).click();
  await expect(game(page)).toHaveAttribute('data-say', /\S/);
});

test('Visiting a placeholder world', async ({ page }) => {
  // Requirement: Placeholder worlds. The online and dream worlds each have a placeholder room.
  await newGame(page);
  const unlocked = await unlockedOtherWorlds(page);
  expect(unlocked.length, 'an unlocked online or dream world').toBeGreaterThan(0);
  for (const world of unlocked) {
    await world.click();
    await expect(game(page)).not.toHaveAttribute('data-world', 'street');
    await expect(game(page)).not.toHaveAttribute('data-scene', content.opening);
    await expect(page.locator('#game canvas')).toBeVisible();
  }
});
