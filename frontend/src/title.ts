import type { SaveStore } from './save';

export interface TitleScreenDeps {
  store: SaveStore;
  /** Starts the game; `room` is set when continuing a save. */
  start: (room?: string) => void;
}

/**
 * Wires the DOM title screen: New game always, Continue only when this browser
 * has a saved game.
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
    deps.start(save?.room);
  });
}
