import { expect, test } from './fixtures';

const SAVE_KEY = 'punland.save.v1';

test('opening the game shows the title screen with the working title and New game', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Tune Story');
  await expect(page.getByRole('heading', { name: 'Tune Story' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New game' })).toBeVisible();
});

test('Continue is not offered without a saved game', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'New game' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeHidden();
});

test('Continue is offered when this browser has a saved game, and resumes it', async ({ page }) => {
  await page.addInitScript((key) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, room: 'opening', savedAt: new Date().toISOString() }));
  }, SAVE_KEY);
  await page.goto('/');
  const cont = page.getByRole('button', { name: 'Continue' });
  await expect(cont).toBeVisible();
  await cont.click();
  await expect(page.locator('#game')).toHaveAttribute('data-scene', 'opening');
});

test('New game starts in the opening scene', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New game' }).click();
  await expect(page.locator('#title-screen')).toBeHidden();
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect(page.locator('#game')).toHaveAttribute('data-scene', 'opening');
});
