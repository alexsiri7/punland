import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  clickHotspot,
  clickScene,
  content,
  continueGame,
  game,
  hotspot,
  inventoryItem,
  newGame,
  playerPosition,
  seedSave,
  worlds,
} from './play';

// Acceptance tests for openspec/specs/worlds/spec.md.

test.use({ actionTimeout: 5_000 });

/** A game outside the pub with the dream open: the dog has played the Song Master's song. */
async function dreamOpen(page: Page): Promise<void> {
  const flags = { 'song-stolen': true };
  await seedSave(page, { room: content.opening, act: '1', goals: [], stats: content.newStats, flags });
  await continueGame(page);
}

/** The Online and Dream buttons the player can choose right now. */
async function unlockedOtherWorlds(page: Page): Promise<Locator[]> {
  const unlocked: Locator[] = [];
  for (const name of ['Online', 'Dream']) {
    const button = worlds(page).getByRole('button', { name });
    if (await button.isEnabled()) unlocked.push(button);
  }
  return unlocked;
}

/** Waits for the player to stop walking near `near`, and returns where they stopped. */
async function stopsAt(page: Page, near: { x: number; y: number }): Promise<{ x: number; y: number }> {
  let last: { x: number; y: number } | null = null;
  let stopped: { x: number; y: number } | null = null;
  await expect
    .poll(async () => {
      const at = await playerPosition(page);
      const still = at && last && at.x === last.x && at.y === last.y;
      if (still && Math.hypot(at.x - near.x, at.y - near.y) < 24) stopped = at;
      last = at;
      return stopped;
    })
    .not.toBeNull();
  if (!stopped) throw new Error('the player never stopped');
  return stopped;
}

test('Switching', async ({ page }) => {
  // Requirement: Switching worlds. The player can switch to any unlocked world.
  await dreamOpen(page);
  await expect(worlds(page).getByRole('button', { name: 'Street' })).toBeVisible();
  await expect(game(page)).toHaveAttribute('data-world', 'street');
  await clickScene(page, content.pavement);
  const left = await stopsAt(page, content.pavement);
  const [other] = await unlockedOtherWorlds(page);
  expect(other, 'an unlocked world besides the street').toBeDefined();
  const name = (await other.textContent())?.trim().toLowerCase();
  await other.click();
  await expect(game(page)).toHaveAttribute('data-world', name ?? '');
  await expect(game(page)).not.toHaveAttribute('data-scene', content.opening);
  await worlds(page).getByRole('button', { name: 'Street' }).click();
  await expect(game(page)).toHaveAttribute('data-world', 'street');
  // Back in the street where the player left it, not at the room's start.
  await expect(game(page)).toHaveAttribute('data-scene', content.opening);
  await expect.poll(() => playerPosition(page)).toEqual(left);
});

test('Locked world', async ({ page }) => {
  // Requirement: Switching worlds. A locked world is shown as locked and cannot be entered.
  await newGame(page);
  const locked = worlds(page).getByRole('button', { disabled: true });
  await expect(locked.first()).toBeVisible();
  await expect(locked.first()).toHaveAccessibleDescription(/locked/i);
  await locked.first().click({ force: true });
  await expect(game(page)).toHaveAttribute('data-world', 'street');
  await expect(game(page)).toHaveAttribute('data-scene', content.coachStation);
});

test('Something done in the street turns up in the dream', async ({ page }) => {
  // Requirement: Things cross worlds. In Act 1, hearing the dog play the Song Master's song on
  // the pub stage is dream material: the cat writes a song of his own about it.
  const flags = { 'song-lesson': true };
  await seedSave(page, { room: 'pub', act: '1', goals: [], stats: content.newStats, flags });
  await continueGame(page);
  await clickHotspot(page, content.rivalOnStage);
  await expect(game(page)).toHaveAttribute('data-say', /\S/);
  await worlds(page).getByRole('button', { name: 'Dream' }).click();
  await expect(game(page)).toHaveAttribute('data-world', 'dream');
  await clickHotspot(page, content.dreamSong);
  await expect(game(page)).toHaveAttribute('data-say', /\S/);
  await expect(inventoryItem(page, content.ownSong)).toBeVisible();
  await expect(hotspot(page, content.dreamSong)).toHaveCount(0);
});

test('The dream opens', async ({ page }) => {
  // Requirement: Switching worlds. The dream is locked in a new game, and unlocks once the dog
  // has played the Song Master's song on the pub stage.
  await newGame(page);
  const dream = worlds(page).getByRole('button', { name: 'Dream' });
  await expect(dream).toBeDisabled();
  await expect(dream).toHaveAccessibleDescription(/locked/i);

  const flags = { 'song-lesson': true };
  await seedSave(page, { room: 'pub', act: '1', goals: [], stats: content.newStats, flags });
  await continueGame(page);
  await expect(dream).toBeDisabled();
  await clickHotspot(page, content.rivalOnStage);
  await expect(dream).toBeEnabled();
  await dream.click();
  await expect(game(page)).toHaveAttribute('data-world', 'dream');
});

test('Visiting a placeholder world', async ({ page }) => {
  // Requirement: Placeholder worlds. The online and dream worlds each have a placeholder room.
  await dreamOpen(page);
  const unlocked = await unlockedOtherWorlds(page);
  expect(unlocked.length, 'an unlocked online or dream world').toBeGreaterThan(0);
  for (const world of unlocked) {
    await world.click();
    await expect(game(page)).not.toHaveAttribute('data-world', 'street');
    await expect(game(page)).not.toHaveAttribute('data-scene', content.opening);
    await expect(page.locator('#game canvas')).toBeVisible();
  }
});
