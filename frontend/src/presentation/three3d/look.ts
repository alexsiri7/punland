import {
  AmbientLight,
  Box3,
  type Color,
  DataTexture,
  DirectionalLight,
  MeshToonMaterial,
  NearestFilter,
  type PerspectiveCamera,
  Raycaster,
  RedFormat,
  type Scene,
  Vector2,
  Vector3,
} from 'three';

/**
 * docs/design/STYLE.md in 3D: two tones per material with a hard terminator, light from the
 * upper left throwing hard shadows down and to the right, and no outlines. The grain is a CSS
 * overlay (style.css, `.grain`).
 *
 * Light is in Three's physical units, where a diffuse surface lit with intensity π shows its own
 * colour: the key and the ambient light add up to that on the lit side. The shade is the key
 * light's ramp step plus the ambient, about 20% darker than the base tone once in sRGB, and a
 * cast shadow leaves the ambient alone, about 45% darker.
 */
const KEY = Math.PI * 0.75;
const AMBIENT = Math.PI * 0.25;
const SHADE_STEP = 0.52;

const ramp = new DataTexture(new Uint8Array([Math.round(SHADE_STEP * 255), 255]), 2, 1, RedFormat);
ramp.minFilter = NearestFilter;
ramp.magFilter = NearestFilter;
ramp.generateMipmaps = false;
ramp.needsUpdate = true;

/** A material in its base tone, shaded by the two-step toon ramp. */
export function toonMaterial(base: Color | string | undefined): MeshToonMaterial {
  return new MeshToonMaterial({ ...(base !== undefined && { color: base }), gradientMap: ramp });
}

/**
 * How far from the camera, in metres, the key light's shadows reach: past every room's back wall,
 * the dream's stage and the feed's far blocks, short of the sky and the city backdrops.
 */
export const SHADOW_REACH = 20;
/** How far past what the camera sees, towards the light, a shadow's caster can be: an awning above the view. */
const CASTER_REACH = 10;
const SHADOW_MAP = 2048;
/** How many rays across and down the view find what it sees, to fit the shadows to. */
const SAMPLES = { across: 33, down: 17 };
/** How far, in metres, what the view sees between its rays can reach past their points. */
const BETWEEN_RAYS = 0.5;

/**
 * Lights `scene` from the upper left, with hard shadows from the key light over what `view` sees
 * of it, up to SHADOW_REACH, with BETWEEN_RAYS to spare. Fitting the shadow map to that, and not to
 * the whole scene with its distant sky or a span that fits every room, keeps its texels small, and
 * the normal bias of a couple of texels keeps lit surfaces from shadowing themselves in stripes,
 * most on the walls the light only grazes.
 */
export function light(scene: Scene, view: PerspectiveCamera): void {
  scene.add(new AmbientLight(0xffffff, AMBIENT));
  const key = new DirectionalLight(0xffffff, KEY);
  key.position.set(-6, 9, 2);
  const camera = key.shadow.camera;
  camera.position.copy(key.position);
  camera.lookAt(key.target.position);
  camera.updateMatrixWorld();
  const seen = new Box3();
  for (const point of seenFrom(view, scene)) seen.expandByPoint(point.applyMatrix4(camera.matrixWorldInverse));
  key.castShadow = !seen.isEmpty();
  seen.expandByScalar(BETWEEN_RAYS);
  key.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  camera.left = seen.min.x;
  camera.right = seen.max.x;
  camera.bottom = seen.min.y;
  camera.top = seen.max.y;
  // The shadow camera looks down its -z axis.
  camera.near = -seen.max.z - CASTER_REACH;
  camera.far = -seen.min.z;
  camera.updateProjectionMatrix();
  key.shadow.normalBias = (2 * Math.max(seen.max.x - seen.min.x, seen.max.y - seen.min.y)) / SHADOW_MAP;
  scene.add(key);
}

/**
 * The nearest points of `scene` that rays from `view` across its picture meet, up to SHADOW_REACH,
 * or, for a ray that meets nothing that near, its point at SHADOW_REACH: what is seen between a ray
 * that meets the room and one that passes it lies between their points. None when no ray meets it.
 */
function seenFrom(view: PerspectiveCamera, scene: Scene): Vector3[] {
  view.updateMatrixWorld();
  const raycaster = new Raycaster();
  raycaster.far = SHADOW_REACH;
  const seen: Vector3[] = [];
  let met = false;
  for (let i = 0; i < SAMPLES.across; i++) {
    for (let j = 0; j < SAMPLES.down; j++) {
      const at = new Vector2((2 * i) / (SAMPLES.across - 1) - 1, (2 * j) / (SAMPLES.down - 1) - 1);
      raycaster.setFromCamera(at, view);
      const hit = raycaster.intersectObject(scene)[0];
      met ||= hit !== undefined;
      seen.push(hit ? hit.point : raycaster.ray.at(SHADOW_REACH, new Vector3()));
    }
  }
  return met ? seen : [];
}
