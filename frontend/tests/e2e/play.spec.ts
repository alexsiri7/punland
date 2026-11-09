import type { Page } from '@playwright/test';
import { SAVE_KEY } from '../../src/services/save';
import { expect, test } from './fixtures';
import { type Save, seedSave } from './play';

// Tests for the acceptance-test helpers themselves, where a spec test relies on them in a way
// its own expected failure would hide.

const STATS = { followers: 0, musicians: 0, practice: 0, instruments: 1 };
async function saved(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), SAVE_KEY);
}

// "Reaching the last act" seeds twice on one page, with the game's autosave in between.
test('Each seedSave takes effect once, and a reload keeps what the game saved', async ({ page }) => {
  const save = (room: string, act: string): Save => ({ room, act, goals: [], stats: STATS });
  const autosave = '{"simulated":"autosave"}';

  await seedSave(page, save('pub', '1'));
  await page.goto('/');
  expect(await saved(page)).toContain('"room":"pub"');

  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [SAVE_KEY, autosave] as const);
  await page.reload();
  expect(await saved(page)).toBe(autosave);

  await seedSave(page, save('street', '2'));
  await page.goto('/');
  expect(await saved(page)).toContain('"room":"street"');

  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [SAVE_KEY, autosave] as const);
  await page.reload();
  expect(await saved(page)).toBe(autosave);
});
