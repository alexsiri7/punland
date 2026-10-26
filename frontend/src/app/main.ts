import '../presentation/fonts';
import '../presentation/style.css';
import { loadContent } from '../content';
import { fromSave, newGame } from '../domain';
import { loadFonts } from '../presentation/fonts';
import { startGame } from '../presentation/phaser2d/game';
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
    await loadFonts(); // Phaser draws text on a canvas, which does not load web fonts by itself
    const content = loadContent();
    const session = new GameSession(content, save ? fromSave(save, content) : newGame(content), store);
    session.save();
    startGame(container, session, createMirror(container, session));
  },
});
