import type { SaveGame, SaveStore } from './save';

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

  cont.hidden = !(await deps.store.hasSave());

  const hideTitle = () => {
    titleScreen.hidden = true;
  };

  newGame.addEventListener('click', async () => {
    await deps.store.clear();
    hideTitle();
    deps.start();
  });

  cont.addEventListener('click', async () => {
    const save = await deps.store.load();
    hideTitle();
    deps.start(save ?? undefined);
  });
}
