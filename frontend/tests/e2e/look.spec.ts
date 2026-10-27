import { expect, test } from './fixtures';
import { newGame, openingSceneModel, playerModel } from './play';

// docs/design/STYLE.md: the Tune Story look. Fonts are self-hosted (the CSP allows fonts
// from 'self' only) and the opening room is drawn from its models.

test('the title screen uses the sign font for the title and the UI font for the menu', async ({ page }) => {
  await page.goto('/');
  const title = page.getByRole('heading', { name: 'Tune Story' });
  await expect(title).toBeVisible();
  await expect(title).toHaveCSS('font-family', /Bebas Neue/);
  await expect(page.getByRole('button', { name: 'New game' })).toHaveCSS('font-family', /Inter/);
  expect(await page.evaluate(() => document.fonts.ready.then(() => document.fonts.check('400 32px "Bebas Neue"')))).toBe(
    true,
  );
});

test('the opening scene loads its models', async ({ page }) => {
  const models: string[] = [];
  page.on('response', (res) => {
    if (res.url().includes('/models/') && res.ok()) models.push(new URL(res.url()).pathname);
  });
  await newGame(page);
  await expect.poll(() => models).toEqual(expect.arrayContaining([openingSceneModel, playerModel]));
});
