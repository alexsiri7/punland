import type { SaveGame } from '../domain';
import type { SaveStore } from '../services/save';

export interface TitleScreenDeps {
  store: SaveStore;
  /** Starts the game; `save` is set when continuing one. */
  start: (save?: SaveGame) => void;
}

/**
 * Wires the DOM title screen: New game always, Continue only when a saved game
 * exists, in this browser or behind the backend.
 */
export async function initTitleScreen(root: ParentNode, deps: TitleScreenDeps): Promise<void> {
  const titleScreen = root.querySelector<HTMLElement>('#title-screen');
  const newGame = root.querySelector<HTMLButtonElement>('#new-game');
  const cont = root.querySelector<HTMLButtonElement>('#continue');
  if (!titleScreen || !newGame || !cont) throw new Error('title screen markup missing');

  // Continue resumes the save that made it visible: a second read that failed would start a
  // new game, and its first autosave would overwrite the backend's copy.
  const save = await deps.store.load();
  cont.hidden = save === null;

  const hideTitle = () => {
    titleScreen.hidden = true;
  };

  newGame.addEventListener('click', async () => {
    await deps.store.clear();
    hideTitle();
    deps.start();
  });

  cont.addEventListener('click', () => {
    hideTitle();
    deps.start(save ?? undefined);
  });
}
