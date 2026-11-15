import { isSaveFor, type SaveGame } from '../domain';
import type { SaveStore } from '../services/save';

export interface TitleScreenDeps {
  store: SaveStore;
  /** The game being played, by id: Continue resumes only its saves. */
  game: string;
  /** Starts the game; `save` is set when continuing one. */
  start: (save?: SaveGame) => void;
}

/**
 * Wires the DOM title screen: New game always, Continue only when a saved game of this game
 * exists, in this browser or behind the backend. A save from another game is not continued,
 * and the title screen says so.
 */
export async function initTitleScreen(root: ParentNode, deps: TitleScreenDeps): Promise<void> {
  const titleScreen = root.querySelector<HTMLElement>('#title-screen');
  const newGame = root.querySelector<HTMLButtonElement>('#new-game');
  const cont = root.querySelector<HTMLButtonElement>('#continue');
  const problem = root.querySelector<HTMLElement>('#title-problem');
  if (!titleScreen || !newGame || !cont || !problem) throw new Error('title screen markup missing');

  const hideTitle = () => {
    titleScreen.hidden = true;
  };

  newGame.addEventListener('click', async () => {
    await deps.store.clear();
    hideTitle();
    deps.start();
  });

  // Continue resumes the save that made it visible: a second read that failed would start a
  // new game, and its first autosave would overwrite the backend's copy.
  const saved = await deps.store.load();
  const save = saved && isSaveFor(saved, deps.game) ? saved : null;
  cont.hidden = save === null;
  if (saved && !save) {
    // There is one save slot, which New game clears.
    tell(problem, `The saved game is for another game (${saved.gameId}), so it can't be continued here. A new game replaces it.`);
  }

  cont.addEventListener('click', () => {
    hideTitle();
    deps.start(save ?? undefined);
  });
}

/** Says on the title screen why the game can't be played, listing its problems. */
export function refuseGame(root: ParentNode, problems: readonly string[]): void {
  const problem = root.querySelector<HTMLElement>('#title-problem');
  if (!problem) throw new Error('title screen markup missing');
  tell(problem, "This game can't be played:", problems);
}

/** Bundle text is untrusted, so it only ever goes in as text. */
function tell(problem: HTMLElement, lead: string, list: readonly string[] = []): void {
  const paragraph = problem.ownerDocument.createElement('p');
  paragraph.textContent = lead;
  const items = list.map((text) => {
    const item = problem.ownerDocument.createElement('li');
    item.textContent = text;
    return item;
  });
  const ul = problem.ownerDocument.createElement('ul');
  ul.append(...items);
  problem.replaceChildren(paragraph, ...(items.length > 0 ? [ul] : []));
  problem.hidden = false;
}
