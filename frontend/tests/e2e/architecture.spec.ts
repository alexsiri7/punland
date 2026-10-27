import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { clickHotspot, content, game, newGame, playerPosition, type Renderer } from './play';

// Acceptance tests for openspec/specs/architecture/spec.md that the player can see. The rest
// are unit tests (tests/unit/architecture.test.ts and *.acceptance.test.ts).

test.use({ actionTimeout: 5_000 });

/** What the player sees and can do at each stop of the opening -> pub -> opening route. */
async function playRoute(page: Page, renderer: Renderer): Promise<unknown[]> {
  const stops: unknown[] = [];
  const stop = async () =>
    stops.push({
      scene: await game(page).getAttribute('data-scene'),
      world: await game(page).getAttribute('data-world'),
      player: await game(page).getAttribute('data-player'),
      controls: await page.locator('body').ariaSnapshot(),
    });
  await newGame(page, renderer);
  await expect.poll(() => playerPosition(page)).not.toBeNull();
  await stop();
  await clickHotspot(page, content.pubDoor);
  await expect(game(page)).toHaveAttribute('data-scene', content.pubInterior);
  await expect.poll(() => playerPosition(page)).toEqual(content.pubEntrance);
  await stop();
  await clickHotspot(page, content.pubDoor);
  await expect(game(page)).toHaveAttribute('data-scene', content.opening);
  await expect.poll(() => playerPosition(page)).toEqual(content.outsidePub);
  await stop();
  return stops;
}

test('Swapping the renderer', async ({ page }) => {
  // Requirement: Replaceable renderer. Whatever the renderer, the same content plays the same,
  // with the same #game data attributes and DOM controls.
  const in2d = await playRoute(page, '2d');
  const in3d = await playRoute(page, '3d');
  expect(in3d).toEqual(in2d);
});
