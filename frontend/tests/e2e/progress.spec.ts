import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  content,
  continueGame,
  conversation,
  enterPub,
  game,
  hotspot,
  inventory,
  inventoryItem,
  newGame,
  type Save,
  seedSave,
  stats,
  stubDialogue,
  stubSaves,
  worlds,
} from './play';

// Acceptance tests for openspec/specs/progress/spec.md.

test.use({ actionTimeout: 5_000 });

const STATS = { followers: 0, musicians: 0, practice: 0, instruments: 1 };

/** Talks to the bartender, whose conversation reaches the current act's last open goal. */
async function reachBartenderGoal(page: Page): Promise<void> {
  await stubDialogue(page, (body) => ({
    line: body.reply ? 'Fine, you win.' : 'Evening.',
    options: [{ text: 'Go on.', reaches_goal: true }],
    goal_reached: body.reply !== null,
    ended: body.reply !== null,
  }));
  await hotspot(page, content.bartender).click();
  await conversation(page).getByRole('button', { name: 'Go on.' }).click();
}

async function statValues(page: Page): Promise<string[]> {
  return stats(page).getByRole('listitem').allTextContents();
}

test('Closing and coming back', async ({ page, context }) => {
  // Requirement: Autosave. Progress is saved automatically, without signing up.
  const saves = new Map<string, string>();
  await stubSaves(page, saves);
  await newGame(page);
  await enterPub(page);
  await expect.poll(() => [...saves.values()].some((save) => save.length > 0)).toBe(true);
  await page.close();

  const again = await context.newPage();
  await again.route('https://punland-api.interstellarai.net/**', (route) => route.fulfill({ json: { status: 'ok' } }));
  await stubSaves(again, saves);
  await continueGame(again);
  await expect(game(again)).toHaveAttribute('data-scene', content.pubInterior);
});

test('Continue keeps the inventory', async ({ page, context }) => {
  // Requirement: Autosave (inventory, #10). What the cat picked up is still carried, and
  // gone from its room, after closing the browser and coming back.
  const saves = new Map<string, string>();
  await stubSaves(page, saves);
  await newGame(page);
  await hotspot(page, content.flyer).click();
  await expect(inventoryItem(page, content.flyer)).toBeVisible();
  await expect.poll(() => [...saves.values()].some((save) => save.includes('flyer'))).toBe(true);
  await page.close();

  const again = await context.newPage();
  await stubSaves(again, saves);
  await again.addInitScript(() => localStorage.removeItem('punland.save.v1'));
  await continueGame(again);
  await expect(game(again)).toHaveAttribute('data-scene', content.opening);
  await expect(inventoryItem(again, content.flyer)).toBeVisible();
  await expect(hotspot(again, content.flyer)).toHaveCount(0);
});

test('Continue drops what the content no longer has', async ({ page }) => {
  // Requirement: Story as content. A save from before a content change can name an item or a
  // room that is gone; Continue still resumes it, without them.
  const save = {
    version: 1,
    room: content.opening,
    savedAt: new Date().toISOString(),
    inventory: { items: ['broken-guitar', 'gone-item'], pickedUp: [] },
    journey: { left: { dream: { room: 'gone-room' } }, gathered: [] },
  };
  await stubSaves(page, new Map());
  await page.addInitScript((value) => localStorage.setItem('punland.save.v1', value), JSON.stringify(save));
  await continueGame(page);
  await expect(game(page)).toHaveAttribute('data-scene', content.opening);
  await expect(inventoryItem(page, content.brokenGuitar)).toBeVisible();
  await expect(inventory(page).getByRole('button')).toHaveCount(1);
  await worlds(page).getByRole('button', { name: 'Dream' }).click();
  await expect(game(page)).toHaveAttribute('data-scene', 'dream');
});

test('A stat changes', async ({ page }) => {
  // Requirement: Career stats. Followers, musicians, practice and instruments are tracked and
  // shown. In the Act 1 placeholder story, getting the job at the pub changes a stat.
  await seedSave(page, { room: 'pub', act: '1', goals: content.act1Goals.slice(0, 1), stats: STATS });
  await continueGame(page);
  for (const name of [/followers/i, /musicians/i, /practice/i, /instruments/i]) {
    await expect(stats(page).getByRole('listitem').filter({ hasText: name })).toBeVisible();
  }
  const before = await statValues(page);
  await reachBartenderGoal(page);
  await expect.poll(() => statValues(page)).not.toEqual(before);
  const after = await statValues(page);

  await page.goto('/');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect.poll(() => statValues(page)).toEqual(after);
});

test('Finishing an act', async ({ page }) => {
  // Requirement: Acts. Completing an act's goals starts the next act.
  await seedSave(page, { room: 'pub', act: '1', goals: content.act1Goals.slice(0, -1), stats: STATS });
  await continueGame(page);
  await expect(game(page)).toHaveAttribute('data-act', '1');
  await reachBartenderGoal(page);
  await expect(game(page)).toHaveAttribute('data-act', '2');
});

test('Reaching the last act', async ({ page }) => {
  // Requirement: Acts. The last act is chosen from the player's decisions and stats.
  const lastActFor = async (stats: Save['stats']): Promise<string | null> => {
    await seedSave(page, { room: 'pub', act: '3', goals: content.act3Goals.slice(0, -1), stats });
    await continueGame(page);
    await reachBartenderGoal(page);
    await expect(game(page)).not.toHaveAttribute('data-act', '3');
    return game(page).getAttribute('data-act');
  };
  const famous = await lastActFor({ followers: 5000, musicians: 0, practice: 0, instruments: 1 });
  const bandmates = await lastActFor({ followers: 0, musicians: 4, practice: 80, instruments: 5 });
  expect(famous).toMatch(/^4/);
  expect(bandmates).toMatch(/^4/);
  expect(famous).not.toEqual(bandmates);
});
