import { expect, test } from './fixtures';

// docs/design/STYLE.md: the Tune Story look. Fonts are self-hosted (the CSP allows fonts
// from 'self' only) and the opening room's art comes from its layer files.

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

test('the opening scene loads its art layers', async ({ page }) => {
  const art: string[] = [];
  page.on('response', (res) => {
    if (res.url().includes('/rooms/opening/') && res.ok()) art.push(new URL(res.url()).pathname);
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'New game' }).click();
  await expect(page.locator('#game')).toHaveAttribute('data-scene', 'opening');
  await expect
    .poll(() => art.sort())
    .toEqual(
      expect.arrayContaining([
        '/rooms/opening/art.json',
        '/rooms/opening/background.jpg',
        '/rooms/opening/cat.png',
        '/rooms/opening/fore.png',
      ]),
    );
});
