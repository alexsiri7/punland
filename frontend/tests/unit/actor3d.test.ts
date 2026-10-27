import { AnimationClip, Group, NumberKeyframeTrack } from 'three';
import { describe, expect, it } from 'vitest';
import { Actor } from '../../src/presentation/three3d/actor';

// Character animation in 3D: each placed model plays its clips with a mixer of its own, and a
// clip the model lacks falls back to idle (asset contract: only idle and walk are required).

function character(...clips: string[]): Group {
  const model = new Group();
  const torso = new Group();
  torso.name = 'torso';
  model.add(torso);
  model.animations = clips.map(
    (name) => new AnimationClip(name, 1, [new NumberKeyframeTrack('torso.position[y]', [0, 1], [0, 1])]),
  );
  return model;
}

describe('the 3D renderer, animating a model', () => {
  it('starts idle and plays the clip it is told', () => {
    const actor = new Actor(character('idle', 'walk', 'pickup'));
    expect(actor.clip).toBe('idle');
    actor.play('walk');
    expect(actor.clip).toBe('walk');
    actor.play('pickup');
    expect(actor.clip).toBe('pickup');
  });

  it('falls back to idle for a clip the model lacks', () => {
    const actor = new Actor(character('idle', 'walk'));
    actor.play('walk');
    actor.play('talk');
    expect(actor.clip).toBe('idle');
  });

  it('cross-fades into the next clip', () => {
    const model = character('idle', 'walk');
    const actor = new Actor(model);
    actor.update(0.5);
    actor.play('walk');
    actor.update(0.05);
    const mixing = model.children[0]!.position.y;
    actor.update(0.2);
    // Both clips move the torso the same way; mid-fade it is still moving, once faded it follows walk alone.
    expect(mixing).toBeGreaterThan(0);
    expect(model.children[0]!.position.y).toBeCloseTo(0.25, 5);
  });
});
