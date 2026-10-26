import { expect, test } from './fixtures';
import { clickScene, content, game, hotspot, newGame } from './play';

// Regression tests for the DOM UI (presentation/ui, docs/ARCHITECTURE.md section 5). These are
// not acceptance tests: they cover paths that cross the renderer, the app and the UI.

test.use({ actionTimeout: 5_000 });

test('A floor click clears the name of a hotspot that has keyboard focus', async ({ page }) => {
  // The canvas keeps focus on the tabbed button through a floor click, so its blur never fires:
  // the walk itself (RoomScene -> app/main.ts -> ui.walked) has to clear the name.
  await newGame(page);
  await hotspot(page, content.board).focus();
  await expect(game(page)).toHaveAttribute('data-hover', content.board);
  await clickScene(page, content.pavement);
  await expect(game(page)).toHaveAttribute('data-hover', '');
});
