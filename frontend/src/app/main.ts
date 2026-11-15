import '../presentation/fonts';
import '../presentation/style.css';
import { fromSave, newGame } from '../domain';
import { BackendSaveStore, LocalSaveStore, savesFor } from '../services/save';
import { type Game, builtInGame, dialogueFor, loadBundle } from './games';
import { playGame } from './game';
import { createRenderer } from './renderers';
import { GameSession } from './session';
import { initTitleScreen, refuseGame } from './title';

/**
 * The game this page plays: the bundle `?bundle=<manifest path>` names, or with no bundle the
 * game built in. Either is checked before the title screen offers it: broken built-in content
 * fails on page load, and a bundle that fails is refused on the title screen, with no New game.
 */
async function chooseGame(newGameButton: HTMLButtonElement): Promise<Game | null> {
  const bundle = new URLSearchParams(location.search).get('bundle');
  if (bundle === null) return builtInGame();
  newGameButton.disabled = true;
  const manifestUrl = URL.parse(bundle, location.href);
  const loaded = manifestUrl
    ? await loadBundle(manifestUrl, new URL(location.href))
    : { problems: [`${bundle}: is not a valid address`] };
  if ('problems' in loaded) {
    newGameButton.hidden = true;
    refuseGame(document, loaded.problems);
    return null;
  }
  newGameButton.disabled = false;
  document.title = loaded.game.name;
  const heading = document.querySelector('#game-title');
  if (heading) heading.textContent = loaded.game.name;
  return loaded.game;
}

async function boot(container: HTMLElement, newGameButton: HTMLButtonElement): Promise<void> {
  const game = await chooseGame(newGameButton);
  if (!game) return;
  const { content, registry } = game;
  const store = savesFor(game.id, new BackendSaveStore(new LocalSaveStore()));
  await initTitleScreen(document, {
    store,
    game: game.id,
    start: async (save) => {
      container.hidden = false;
      const session = new GameSession(content, save ? fromSave(save, content) : newGame(content), store);
      session.save();
      await playGame(container, session, await createRenderer(registry), dialogueFor(game.id));
    },
  });
}

const container = document.querySelector<HTMLElement>('#game');
const newGameButton = document.querySelector<HTMLButtonElement>('#new-game');
if (!container || !newGameButton) throw new Error('#game container or New game missing');
void boot(container, newGameButton);
