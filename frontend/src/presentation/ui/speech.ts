import type { Speaker } from '../../domain';
import type { ScenePoint } from '../renderer';
import { SCENE_HEIGHT, SCENE_WIDTH, UI_BAR_HEIGHT } from '../theme';

/** How long a spoken line stays up, in ms: longer lines for longer. */
export function speechMs(line: string): number {
  return Math.max(3000, 60 * line.length);
}

export interface SpokenLine {
  text: string;
  by: Speaker;
}

export interface LineQueue {
  /** Shows the line for speechMs(text), once the lines said before it have had their turn. */
  say(text: string, by: Speaker): void;
  /** Ends the line up and drops the ones waiting. */
  hush(): void;
}

/**
 * Lines said one after another, as in a cutscene: each is up for its time, then the next.
 * `show` gets each line as it comes up, and null once none is.
 */
export function createLineQueue(show: (line: SpokenLine | null) => void): LineQueue {
  const waiting: SpokenLine[] = [];
  let up = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const next = () => {
    const line = waiting.shift();
    up = line !== undefined;
    show(line ?? null);
    if (line) timer = setTimeout(next, speechMs(line.text));
  };
  return {
    say(text, by) {
      waiting.push({ text, by });
      if (!up) next();
    },
    hush() {
      clearTimeout(timer);
      waiting.length = 0;
      up = false;
      show(null);
    },
  };
}

export interface Speech extends LineQueue {
  readonly element: HTMLElement;
  /** Moves the line up, if any, to have its foot at its speaker's head. */
  follow(): void;
}

/**
 * The speech line over the room: the lines said, in turn, each with its foot at `locate` of its
 * speaker and kept 16 scene px inside the scene.
 */
export function createSpeech(doc: Document, locate: (by: Speaker) => ScenePoint): Speech {
  const element = doc.createElement('p');
  element.className = 'speech';
  element.hidden = true;
  let current: SpokenLine | null = null;
  /** The line's half width and height in scene px, with the margin: measured once per line. */
  let size = { half: 0, height: 0 };
  const place = (at: ScenePoint) => {
    const x = Math.min(Math.max(at.x, size.half), SCENE_WIDTH - size.half);
    const y = Math.max(size.height, at.y);
    element.style.left = `${(100 * x) / SCENE_WIDTH}%`;
    element.style.top = `${(100 * y) / (SCENE_HEIGHT + UI_BAR_HEIGHT)}%`;
  };
  const queue = createLineQueue((line) => {
    current = line;
    element.hidden = line === null;
    if (!line) return;
    element.textContent = line.text;
    const parent = element.offsetParent;
    const s = parent ? parent.clientWidth / SCENE_WIDTH : 1;
    size = { half: element.offsetWidth / s / 2 + 16, height: element.offsetHeight / s + 16 };
    place(locate(line.by));
  });
  return {
    element,
    ...queue,
    follow() {
      if (current) place(locate(current.by));
    },
  };
}
