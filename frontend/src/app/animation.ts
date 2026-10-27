import type { AnimationName } from '../presentation/renderer';
import { speechMs } from '../presentation/ui/speech';
import type { GameSession } from './session';

/** How long `pickup` and `use` hold before the next clip: the asset contract's once clips run about 0.6 s. */
export const ONCE_MS = 600;

/**
 * The clips the characters play, from the session's events (models spec, "Character animation").
 * The player walks while walking. Standing, they play `pickup` once after picking something up
 * and `use` once after an accepted use, then `talk` while their line is up, then `idle`. A
 * character talks from the start of a conversation with them until the player walks, leaves the
 * room or leaves the conversation (`conversationLeft`, from the dialogue panel). `play` is called
 * only when a clip changes, the player's once a command's events are in; `who` is 'player' or a
 * hotspot id.
 */
export function animate(
  session: GameSession,
  play: (who: 'player' | string, clip: AnimationName) => void,
): { conversationLeft(): void } {
  let walking = false;
  let once: { clip: AnimationName; until: number } | null = null;
  let talkingUntil = 0;
  let playing: AnimationName = 'idle';
  /** The hotspot of the character the player is talking to. */
  let talker: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const update = () => {
    clearTimeout(timer);
    const now = Date.now();
    if (once && once.until <= now) once = null;
    const talking = talkingUntil > now;
    const clip: AnimationName = walking ? 'walk' : once ? once.clip : talking ? 'talk' : 'idle';
    if (clip !== playing) {
      playing = clip;
      play('player', clip);
    }
    const next = once?.until ?? (talking ? talkingUntil : undefined);
    if (!walking && next !== undefined) timer = setTimeout(update, next - now);
  };
  // A command's events come one after another (arrived, then what the walk was for): the player's
  // clip settles once they are all in, so arriving to talk goes from walk to talk.
  let settling = false;
  const settle = () => {
    if (settling) return;
    settling = true;
    queueMicrotask(() => {
      settling = false;
      update();
    });
  };
  const stopTalker = () => {
    if (talker !== null) play(talker, 'idle');
    talker = null;
  };

  session.subscribe((event) => {
    switch (event.type) {
      case 'moved':
        walking = true;
        once = null;
        stopTalker();
        break;
      case 'arrived':
        walking = false;
        break;
      case 'said':
        if (event.by === 'player') talkingUntil = Date.now() + speechMs(event.line);
        break;
      case 'hushed':
        talkingUntil = 0;
        break;
      case 'pickedUp':
        once = { clip: 'pickup', until: Date.now() + ONCE_MS };
        break;
      case 'used':
        once = { clip: 'use', until: Date.now() + ONCE_MS };
        break;
      case 'conversationStarted': {
        stopTalker();
        const room = session.content.rooms[session.state.room];
        const hotspot = room?.hotspots.find((h) => 'entity' in h.target && h.target.entity === event.character);
        if (hotspot) {
          talker = hotspot.id;
          play(talker, 'talk');
        }
        return;
      }
      case 'roomChanged':
        // The new room's characters start idle.
        walking = false;
        once = null;
        talker = null;
        break;
      default:
        return;
    }
    settle();
  });
  return { conversationLeft: stopTalker };
}
