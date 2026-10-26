import { SCENE_HEIGHT, SCENE_WIDTH, UI_BAR_HEIGHT } from '../theme';
import type { ScenePoint } from './overlay';

/** How long a spoken line stays up, in ms: longer lines for longer. */
export function speechMs(line: string): number {
  return Math.max(3000, 60 * line.length);
}

export interface Speech {
  readonly element: HTMLElement;
  /** Shows a line with its foot at `at` for speechMs(line), kept 16 scene px inside the scene. */
  say(line: string, at: ScenePoint): void;
  hush(): void;
}

/** The player's speech line, over the room. */
export function createSpeech(doc: Document): Speech {
  const line = doc.createElement('p');
  line.className = 'speech';
  line.hidden = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const hush = () => {
    clearTimeout(timer);
    line.hidden = true;
  };
  return {
    element: line,
    say(text, at) {
      hush();
      line.textContent = text;
      line.hidden = false;
      const parent = line.offsetParent;
      const s = parent ? parent.clientWidth / SCENE_WIDTH : 1;
      const half = line.offsetWidth / s / 2 + 16;
      const x = Math.min(Math.max(at.x, half), SCENE_WIDTH - half);
      const y = Math.max(line.offsetHeight / s + 16, at.y);
      line.style.left = `${(100 * x) / SCENE_WIDTH}%`;
      line.style.top = `${(100 * y) / (SCENE_HEIGHT + UI_BAR_HEIGHT)}%`;
      timer = setTimeout(hush, speechMs(text));
    },
    hush,
  };
}
