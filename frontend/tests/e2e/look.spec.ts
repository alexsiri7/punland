import { expect, test } from './fixtures';
import { isThreeD, newGame } from './play';

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
  test.fail(isThreeD(), 'loads the 2D art layers: B7 replaces it with the scene models');
  const art: string[] = [];
  page.on('response', (res) => {
    if (res.url().includes('/rooms/opening/') && res.ok()) art.push(new URL(res.url()).pathname);
  });
  await newGame(page);
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
