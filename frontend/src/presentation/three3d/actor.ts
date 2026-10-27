import { type AnimationAction, AnimationClip, AnimationMixer, LoopOnce, type Object3D } from 'three';
import type { AnimationName } from '../renderer';

/** Seconds one clip takes to cross-fade into the next. */
const FADE_S = 0.15;
/** The asset contract's clips that play once; the rest loop. */
const ONCE: ReadonlySet<string> = new Set<AnimationName>(['pickup', 'use']);

/** A placed model playing its clips (asset contract), with an AnimationMixer of its own. */
export class Actor {
  private readonly mixer: AnimationMixer;
  private current: AnimationAction | null = null;

  constructor(readonly object: Object3D) {
    this.mixer = new AnimationMixer(object);
    this.play('idle');
  }

  /**
   * Cross-fades to the clip, or to `idle` when the model lacks it (only `idle` and `walk` are
   * required); a model with neither stays as it is.
   */
  play(name: AnimationName): void {
    const clip =
      AnimationClip.findByName(this.object.animations, name) ?? AnimationClip.findByName(this.object.animations, 'idle');
    if (!clip) return;
    const action = this.mixer.clipAction(clip);
    if (action === this.current) return;
    action.reset();
    if (ONCE.has(clip.name)) {
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    action.play();
    if (this.current) action.crossFadeFrom(this.current, FADE_S, false);
    this.current = action;
  }

  /** The clip playing now, by name, if any. */
  get clip(): string | null {
    return this.current?.getClip().name ?? null;
  }

  update(dtS: number): void {
    this.mixer.update(dtS);
  }
}
