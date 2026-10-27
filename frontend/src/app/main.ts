import '../presentation/fonts';
import '../presentation/style.css';
import { loadContent } from '../content';
import { fromSave, newGame } from '../domain';
import { startGame } from '../presentation/phaser2d/game';
import { mountUi } from '../presentation/ui';
import { BackendDialogue } from '../services/dialogue';
import { BackendSaveStore, LocalSaveStore } from '../services/save';
import { createMirror } from './mirror';
import { GameSession } from './session';
import { initTitleScreen } from './title';

const store = new BackendSaveStore(new LocalSaveStore());
const container = document.querySelector<HTMLElement>('#game');
if (!container) throw new Error('#game container missing');

void initTitleScreen(document, {
  store,
  start: async (save) => {
    container.hidden = false;
    const content = loadContent();
    const session = new GameSession(content, save ? fromSave(save, content) : newGame(content), store);
    session.save();
    const mirror = createMirror(container, session);
    const ui = mountUi(container, session, mirror, new BackendDialogue());
    startGame(container, session, {
      shown(room) {
        ui.shown(room);
        mirror.shown();
      },
      walked() {
        ui.walked();
      },
    });
  },
});
