import type { AnimationName } from '../presentation/renderer';
import { createLineQueue } from '../presentation/ui/speech';
import type { GameSession } from './session';

/** How long `pickup` and `use` hold before the next clip: the asset contract's once clips run about 0.6 s. */
export const ONCE_MS = 600;

/**
 * The clips the characters play, from the session's events (models spec, "Character animation").
 * The player walks while walking. Standing, they play `pickup` once after picking something up
 * and `use` once after an accepted use, then `talk` while their line is up, then `idle`. A
 * character talks while a line of theirs is up (lines are up in turn, as the speech line shows
 * them), and from the start of a conversation with them until the player walks, leaves the
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
  /** The player's line is up. */
  let talking = false;
  let playing: AnimationName = 'idle';
  /** The hotspot of the character the player is talking to. */
  let talker: string | null = null;
  /** The hotspot of the character whose line is up. */
  let speaker: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const update = () => {
    clearTimeout(timer);
    const now = Date.now();
    if (once && once.until <= now) once = null;
    const clip: AnimationName = walking ? 'walk' : once ? once.clip : talking ? 'talk' : 'idle';
    if (clip !== playing) {
      playing = clip;
      play('player', clip);
    }
    if (!walking && once) timer = setTimeout(update, once.until - now);
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
    if (talker !== null && talker !== speaker) play(talker, 'idle');
    talker = null;
  };
  const hotspotOf = (character: string) =>
    session.content.rooms[session.state.room]?.hotspots.find(
      (h) => 'entity' in h.target && h.target.entity === character,
    )?.id ?? null;
  const lines = createLineQueue((line) => {
    talking = line?.by === 'player';
    const next = line && line.by !== 'player' ? hotspotOf(line.by) : null;
    if (next !== speaker) {
      if (speaker !== null && speaker !== talker) play(speaker, 'idle');
      if (next !== null && next !== talker) play(next, 'talk');
      speaker = next;
    }
    settle();
  });

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
        lines.say(event.line, event.by);
        return;
      case 'hushed':
        lines.hush();
        return;
      case 'pickedUp':
        once = { clip: 'pickup', until: Date.now() + ONCE_MS };
        break;
      case 'used':
        once = { clip: 'use', until: Date.now() + ONCE_MS };
        break;
      case 'conversationStarted': {
        stopTalker();
        talker = hotspotOf(event.character);
        if (talker !== null && talker !== speaker) play(talker, 'talk');
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
