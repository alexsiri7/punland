import './style.css';
import { startGame } from './game';
import { LocalSaveStore } from './save';
import { initTitleScreen } from './title';

const store = new LocalSaveStore();
const container = document.querySelector<HTMLElement>('#game');
if (!container) throw new Error('#game container missing');

void initTitleScreen(document, {
  store,
  start: (room) => {
    container.hidden = false;
    startGame(container, { room });
  },
});
