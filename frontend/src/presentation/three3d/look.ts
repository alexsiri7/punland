import {
  AmbientLight,
  type Color,
  DataTexture,
  DirectionalLight,
  MeshToonMaterial,
  NearestFilter,
  RedFormat,
  type Scene,
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

/** How far across, in metres, the key light's shadows reach around the origin: past every room's floor. */
const SHADOW_SPAN = 16;

/** Lights `scene` from the upper left, with hard shadows from the key light around the origin. */
export function light(scene: Scene): void {
  scene.add(new AmbientLight(0xffffff, AMBIENT));
  const key = new DirectionalLight(0xffffff, KEY);
  key.position.set(-6, 9, 2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0005;
  const camera = key.shadow.camera;
  camera.left = -SHADOW_SPAN / 2;
  camera.right = SHADOW_SPAN / 2;
  camera.top = SHADOW_SPAN / 2;
  camera.bottom = -SHADOW_SPAN / 2;
  camera.near = 1;
  camera.far = 40;
  scene.add(key);
}
