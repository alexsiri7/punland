import type { ScenePoint } from '../renderer';
import { SCENE_HEIGHT, SCENE_WIDTH, UI_BAR_HEIGHT } from '../theme';

/** How long a spoken line stays up, in ms: longer lines for longer. */
export function speechMs(line: string): number {
  return Math.max(3000, 60 * line.length);
}

export interface Speech {
  readonly element: HTMLElement;
  /** Shows a line with its foot at `at` for speechMs(line), kept 16 scene px inside the scene. */
  say(line: string, at: ScenePoint): void;
  /** Moves the line up, if any, to have its foot at `at`. */
  follow(at: ScenePoint): void;
  hush(): void;
}

/** The player's speech line, over the room. */
export function createSpeech(doc: Document): Speech {
  const line = doc.createElement('p');
  line.className = 'speech';
  line.hidden = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** The line's half width and height in scene px, with the margin: measured once per line. */
  let size = { half: 0, height: 0 };
  const hush = () => {
    clearTimeout(timer);
    line.hidden = true;
  };
  const place = (at: ScenePoint) => {
    const x = Math.min(Math.max(at.x, size.half), SCENE_WIDTH - size.half);
    const y = Math.max(size.height, at.y);
    line.style.left = `${(100 * x) / SCENE_WIDTH}%`;
    line.style.top = `${(100 * y) / (SCENE_HEIGHT + UI_BAR_HEIGHT)}%`;
  };
  return {
    element: line,
    say(text, at) {
      hush();
      line.textContent = text;
      line.hidden = false;
      const parent = line.offsetParent;
      const s = parent ? parent.clientWidth / SCENE_WIDTH : 1;
      size = { half: line.offsetWidth / s / 2 + 16, height: line.offsetHeight / s + 16 };
      place(at);
      timer = setTimeout(hush, speechMs(text));
    },
    follow(at) {
      if (!line.hidden) place(at);
    },
    hush,
  };
}
