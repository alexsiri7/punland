import { AnimationClip, Group } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Models } from '../../src/presentation/three3d/models';

// A model whose file fails to load is left out of the room rather than taking the room down.

describe('the 3D renderer, loading models', () => {
  afterEach(() => vi.restoreAllMocks());

  it('gives no model for a file that fails to load, and tries again next time', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const load = vi
      .spyOn(GLTFLoader.prototype, 'loadAsync')
      .mockRejectedValueOnce(new Error('404'))
      .mockResolvedValueOnce({ scene: new Group(), animations: [] } as never);
    const models = new Models();

    await expect(models.instance('character/protagonist')).resolves.toBeNull();
    await expect(models.instance('character/protagonist')).resolves.toBeInstanceOf(Group);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("gives each copy the file's clips", async () => {
    const walk = new AnimationClip('walk', 1, []);
    vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockResolvedValue({ scene: new Group(), animations: [walk] } as never);
    const models = new Models();

    const copies = await Promise.all([models.instance('character/protagonist'), models.instance('character/protagonist')]);
    expect(copies[0]).not.toBe(copies[1]);
    for (const copy of copies) expect(AnimationClip.findByName(copy!.animations, 'walk')).toBe(walk);
  });
});
