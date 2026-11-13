import { BoxGeometry, DirectionalLight, Mesh, PerspectiveCamera, PlaneGeometry, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { light } from '../../src/presentation/three3d/look';

// docs/design/STYLE.md's hard shadows without stripes (#134): the key light's shadow map covers
// what the room's camera sees, not the scene's distant sky, so its texels stay small.

function room(): { scene: Scene; view: PerspectiveCamera } {
  const scene = new Scene();
  const view = new PerspectiveCamera(25, 2);
  view.position.set(0, 2.5, 8);
  view.lookAt(0, 1.5, 0);
  const floor = new Mesh(new PlaneGeometry(10, 4));
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = -2;
  const wall = new Mesh(new BoxGeometry(10, 4, 0.2));
  wall.position.set(0, 2, -4);
  const sky = new Mesh(new PlaneGeometry(500, 200));
  sky.position.z = -300;
  scene.add(floor, wall, sky);
  scene.updateMatrixWorld(true);
  return { scene, view };
}

function keyLight(scene: Scene): DirectionalLight {
  const key = scene.children.find((child) => child instanceof DirectionalLight);
  if (!key) throw new Error('no key light');
  return key;
}

describe('the 3D look, the key light', () => {
  it('fits its shadows to what the camera sees of the room', () => {
    const { scene, view } = room();
    light(scene, view);
    const key = keyLight(scene);
    const { left, right, top, bottom } = key.shadow.camera;
    expect(key.castShadow).toBe(true);
    expect(right - left).toBeLessThan(15);
    expect(top - bottom).toBeLessThan(15);
    // The floor's corner in front of the camera and the wall's top behind it are in its shadow map.
    const camera = key.shadow.camera;
    camera.position.copy(key.position);
    camera.lookAt(key.target.position);
    camera.updateMatrixWorld();
    for (const corner of [new Vector3(-3, 0, 0), new Vector3(3, 3.9, -3.9)]) {
      const at = corner.applyMatrix4(camera.matrixWorldInverse);
      expect(at.x).toBeGreaterThanOrEqual(left);
      expect(at.x).toBeLessThanOrEqual(right);
      expect(at.y).toBeGreaterThanOrEqual(bottom);
      expect(at.y).toBeLessThanOrEqual(top);
    }
    expect(key.shadow.normalBias).toBeGreaterThan(0);
  });

  it('casts no shadow in a room with nothing to see', () => {
    const scene = new Scene();
    light(scene, new PerspectiveCamera());
    expect(keyLight(scene).castShadow).toBe(false);
  });
});
