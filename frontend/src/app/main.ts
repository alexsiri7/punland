import '../presentation/fonts';
import '../presentation/style.css';
import { loadContent } from '../content';
import { fromSave, newGame } from '../domain';
import { BackendDialogue } from '../services/dialogue';
import { completeSignIn, fetchOwner, signInUrl, signOut } from '../services/owner';
import { BackendSaveStore, LocalSaveStore } from '../services/save';
import { playGame } from './game';
import { createRenderer } from './renderers';
import { GameSession } from './session';
import { initTitleScreen } from './title';

// Checked before the title screen, so broken content fails on page load.
const content = loadContent();
const store = new BackendSaveStore(new LocalSaveStore());
const container = document.querySelector<HTMLElement>('#game');
if (!container) throw new Error('#game container missing');

// Back from Google's sign-in, the ID token is in the address: hand it over before asking /me.
const ownerStatus = completeSignIn().then(() => fetchOwner());
let owner = false;
void ownerStatus.then((status) => {
  owner = status.owner;
});

void initTitleScreen(document, {
  store,
  owner: {
    status: ownerStatus,
    signIn: (clientId) => location.assign(signInUrl(clientId)),
    signOut: async () => {
      owner = false;
      await signOut();
    },
  },
  start: async (save) => {
    container.hidden = false;
    const session = new GameSession(content, save ? fromSave(save, content) : newGame(content), store);
    session.save();
    await playGame(container, session, await createRenderer(), new BackendDialogue(), { owner });
  },
});
