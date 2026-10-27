import type { FloorPoint } from '../domain';
import type { AnimationName } from '../presentation/renderer';
import { speechMs } from '../presentation/ui/speech';
import type { GameSession } from './session';

/**
 * What the canvas shows, mirrored on #game for tests and the DOM (tests/e2e/play.ts):
 * data-scene (room id), data-world (its world), data-player ("x,y" in scene pixels),
 * data-hover (the hotspot under the pointer), data-say (the player's line, empty when
 * silent), data-act (the act being played) and data-player-animation (the clip the player
 * plays). The player, their speech and the act follow the session's
 * events, and the clip follows the app's animator (app/animation.ts). The room follows the
 * view, which says when it has drawn it and takes clicks there, and hover follows the UI
 * (presentation/ui), which reports it: it is the pointer's and not the session's.
 */
/** What only the view and the UI know, for the mirror. */
export interface ViewMirror {
  /** The session's room is drawn and takes input. */
  shown(): void;
  /** The name of the hotspot under the pointer, empty for none. */
  hover(name: string): void;
  /** The clip the player plays now. */
  playerAnimation(clip: AnimationName): void;
}

export function createMirror(container: HTMLElement, session: GameSession): ViewMirror {
  const data = container.dataset;
  data.playerAnimation = 'idle';
  let speaking: ReturnType<typeof setTimeout> | undefined;
  const say = (line: string) => {
    clearTimeout(speaking);
    data.say = line;
    if (line) speaking = setTimeout(() => say(''), speechMs(line));
  };
  const place = (at: FloorPoint) => {
    data.player = `${Math.round(at.x)},${Math.round(at.y)}`;
  };
  session.subscribe((event) => {
    if (event.type === 'moved') place(event.at);
    else if (event.type === 'said') say(event.line);
    else if (event.type === 'hushed') say('');
    else if (event.type === 'actStarted') data.act = event.act;
  });
  return {
    shown() {
      const { room, at } = session.state;
      data.scene = room;
      data.world = session.content.rooms[room]?.world ?? '';
      data.hover = '';
      data.act = session.state.act;
      place(at);
      say('');
    },
    hover(name) {
      data.hover = name;
    },
    playerAnimation(clip) {
      data.playerAnimation = clip;
    },
  };
}
