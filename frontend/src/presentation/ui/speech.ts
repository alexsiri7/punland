import { type Speaker, speechMs } from '../../domain';
import type { Renderer, ScenePoint } from '../renderer';
import type { Session } from '../session';
import { SCENE_HEIGHT, SCENE_WIDTH, UI_BAR_HEIGHT } from '../theme';

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

export interface Speech {
  readonly element: HTMLElement;
  /** The renderer has drawn the session's room: the line up goes, and lines said from now on show over their speakers. */
  shown(): void;
}

/**
 * The speech line over the room: the session's lines, in turn, each with its foot at its
 * speaker's head and kept 16 scene px inside the scene. A line said while no room is drawn (once
 * the session changes room, until the new one is shown) is not shown; `hushed` drops them all.
 * The line follows its speaker's head every frame.
 */
export function createSpeech(doc: Document, session: Session, renderer: Pick<Renderer, 'anchor' | 'frame'>): Speech {
  const element = doc.createElement('p');
  element.className = 'speech';
  element.hidden = true;
  let current: SpokenLine | null = null;
  let drawn = false;
  /** Whether the line follows its speaker every frame; from the first room shown, once the renderer is mounted. */
  let following = false;
  /** The line's half width and height in scene px, with the margin: measured once per line. */
  let size = { half: 0, height: 0 };
  /** Over the speaker's head: the player's, or a character's in the room; the player's for one not there. */
  const locate = (by: Speaker): ScenePoint => {
    const room = session.content.rooms[session.state.room];
    const hotspot =
      by === 'player'
        ? undefined
        : room?.hotspots.find((h) => 'entity' in h.target && h.target.entity === by && session.isPresent(h));
    if (hotspot && 'entity' in hotspot.target) return renderer.anchor(hotspot.id, 'head') ?? hotspot.target.at;
    return renderer.anchor('player', 'head') ?? session.state.at;
  };
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
  session.subscribe((event) => {
    if (event.type === 'said' && drawn) queue.say(event.line, event.by);
    else if (event.type === 'hushed') queue.hush();
    else if (event.type === 'roomChanged') drawn = false;
  });
  return {
    element,
    shown() {
      drawn = true;
      if (!following) {
        following = true;
        renderer.frame(() => {
          if (drawn && current) place(locate(current.by));
        });
      }
      queue.hush();
    },
  };
}
