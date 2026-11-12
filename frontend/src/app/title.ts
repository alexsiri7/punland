import type { SaveGame } from '../domain';
import type { OwnerStatus } from '../services/owner';
import type { SaveStore } from '../services/save';

export interface TitleScreenDeps {
  store: SaveStore;
  /** Starts the game; `save` is set when continuing one. */
  start: (save?: SaveGame) => void;
  /** Owner sign-in; without it, or without a client id, the title screen offers none. */
  owner?: OwnerSignIn;
}

export interface OwnerSignIn {
  status: Promise<OwnerStatus>;
  signIn(clientId: string): void;
  /** Resolves whether the session ended; the owner stays signed in when it did not. */
  signOut(): Promise<boolean>;
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
  if (deps.owner) initOwnerSignIn(root, deps.owner);

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

/** The small Owner sign-in/sign-out link, shown only once the backend says sign-in exists. */
function initOwnerSignIn(root: ParentNode, owner: OwnerSignIn): void {
  const signIn = root.querySelector<HTMLButtonElement>('#owner-sign-in');
  const signOut = root.querySelector<HTMLButtonElement>('#owner-sign-out');
  if (!signIn || !signOut) return;
  let clientId: string | null = null;

  void owner.status.then((status) => {
    clientId = status.googleClientId;
    signOut.hidden = !status.owner;
    signIn.hidden = status.owner || clientId === null;
  });

  signIn.addEventListener('click', () => {
    if (clientId) owner.signIn(clientId);
  });

  signOut.addEventListener('click', async () => {
    if (!(await owner.signOut())) return;
    signOut.hidden = true;
    signIn.hidden = clientId === null;
  });
}
