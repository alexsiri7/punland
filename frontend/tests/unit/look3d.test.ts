import {
  BoxGeometry,
  DirectionalLight,
  FrontSide,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { light, SHADOW_REACH } from '../../src/presentation/three3d/look';
import { SCENE_HEIGHT, SCENE_WIDTH } from '../../src/presentation/theme';
import { modelFiles } from './support/files';

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

/** A room's scene model seen from its cam_main, as the renderer draws it: front faces only. */
async function sceneModel(id: string): Promise<{ scene: Scene; view: PerspectiveCamera }> {
  const bytes = modelFiles[`models/scenes/${id}.glb`]!;
  const gltf = await new GLTFLoader().parseAsync(bytes.slice().buffer, '');
  gltf.scene.traverse((object) => {
    if (object instanceof Mesh) for (const material of [object.material].flat()) material.side = FrontSide;
  });
  const view = gltf.scene.getObjectByName('cam_main');
  if (!(view instanceof PerspectiveCamera)) throw new Error(`${id} has no cam_main`);
  view.aspect = SCENE_WIDTH / SCENE_HEIGHT;
  view.updateProjectionMatrix();
  const scene = new Scene();
  scene.add(gltf.scene);
  scene.updateMatrixWorld(true);
  view.updateMatrixWorld();
  return { scene, view };
}

function keyLight(scene: Scene): DirectionalLight {
  const key = scene.children.find((child) => child instanceof DirectionalLight);
  if (!key) throw new Error('no key light');
  return key;
}

/** Where `point` falls in the key light's shadow camera: x and y across its map, and its depth. */
function inShadowCamera(key: DirectionalLight, point: Vector3): { x: number; y: number; depth: number } {
  const camera = key.shadow.camera;
  camera.position.copy(key.position);
  camera.lookAt(key.target.position);
  camera.updateMatrixWorld();
  const at = point.clone().applyMatrix4(camera.matrixWorldInverse);
  return { x: at.x, y: at.y, depth: -at.z };
}

function expectInShadowMap(key: DirectionalLight, point: Vector3): void {
  const { left, right, top, bottom, near, far } = key.shadow.camera;
  const at = inShadowCamera(key, point);
  expect(at.x).toBeGreaterThanOrEqual(left);
  expect(at.x).toBeLessThanOrEqual(right);
  expect(at.y).toBeGreaterThanOrEqual(bottom);
  expect(at.y).toBeLessThanOrEqual(top);
  expect(at.depth).toBeGreaterThanOrEqual(near);
  expect(at.depth).toBeLessThanOrEqual(far);
}

describe('the 3D look, the key light', () => {
  it('fits its shadows to what the camera sees of the room', () => {
    const { scene, view } = room();
    light(scene, view);
    const key = keyLight(scene);
    const { left, right, top, bottom } = key.shadow.camera;
    expect(key.castShadow).toBe(true);
    // Not the 500 m sky past the wall.
    expect(right - left).toBeLessThan(SHADOW_REACH);
    expect(top - bottom).toBeLessThan(SHADOW_REACH);
    // The floor's corner in front of the camera and the wall's top behind it are in its shadow map.
    for (const corner of [new Vector3(-3, 0, 0), new Vector3(3, 3.9, -3.9)]) expectInShadowMap(key, corner);
  });

  // Two texels of the fitted map: enough to stop the stripes, too little to float a shadow off its caster.
  it('biases its shadows by two texels of its shadow map', () => {
    const { scene, view } = room();
    light(scene, view);
    const { shadow } = keyLight(scene);
    const { left, right, top, bottom } = shadow.camera;
    expect(shadow.normalBias).toBeCloseTo((2 * Math.max(right - left, top - bottom)) / shadow.mapSize.x, 6);
  });

  it('keeps a caster above the view, out of its picture, in its shadow map', () => {
    const { scene, view } = room();
    light(scene, view);
    // An awning high over the floor, between it and the light.
    const floor = new Vector3(1, 0, -1);
    expectInShadowMap(keyLight(scene), floor.addScaledVector(new Vector3(-6, 9, 2), 0.8));
  });

  // Everything the camera sees, not just what the light's fitting rays meet: a surface between
  // two rays left out of the shadow map would be drawn lit, its shadow cut off at a straight line.
  it.each(['dream', 'high-street', 'feed', 'opening'])('covers everything the camera sees in %s', async (id) => {
    const { scene, view } = await sceneModel(id);
    light(scene, view);
    const key = keyLight(scene);
    const raycaster = new Raycaster();
    raycaster.far = SHADOW_REACH;
    const across = 161;
    const down = 81;
    for (let i = 0; i < across; i++) {
      for (let j = 0; j < down; j++) {
        raycaster.setFromCamera(new Vector2((2 * i) / (across - 1) - 1, (2 * j) / (down - 1) - 1), view);
        const hit = raycaster.intersectObject(scene)[0];
        if (hit) expectInShadowMap(key, hit.point);
      }
    }
  });

  it("reaches the back of the dream's stage", async () => {
    const { scene, view } = await sceneModel('dream');
    light(scene, view);
    const key = keyLight(scene);
    const stage = scene.getObjectByName('stage')!;
    const raycaster = new Raycaster();
    let seen = 0;
    for (let i = 0; i < 161; i++) {
      for (let j = 0; j < 81; j++) {
        raycaster.setFromCamera(new Vector2(i / 80 - 1, j / 40 - 1), view);
        const hit = raycaster.intersectObject(scene)[0];
        if (hit && hit.object.parent === stage) {
          seen++;
          expectInShadowMap(key, hit.point);
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('casts no shadow in a room with nothing to see', () => {
    const scene = new Scene();
    light(scene, new PerspectiveCamera());
    expect(keyLight(scene).castShadow).toBe(false);
  });
});
