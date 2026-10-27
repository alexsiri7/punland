import { type Glb, type GlbNode, type Mat4, readGlb, type Vec3 } from './glb';
import type { ModelKind } from './registry';

/**
 * The asset contract (docs/ARCHITECTURE.md, section 8) as a check of one glb file: every rule
 * the table there marks ✓, for the model's kind. The unit tests run it over every `model3d`
 * file in the registry (validate.ts), so a designer's file that breaks a rule fails `npm test`.
 */

/** A rule a model file breaks: `rule` is its topic in section 8 and what it is about, e.g. `nodes: anchor_head`. */
export interface ContractBreach {
  file: string;
  rule: string;
  message: string;
}

/** The CSP blocks the wasm decoders these need. */
const FORBIDDEN_EXTENSIONS = ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu'];

const NODES: Record<ModelKind, readonly string[]> = {
  scene: ['cam_main', 'floor'],
  character: ['anchor_head', 'anchor_hand_r', 'anchor_back'],
  object: [],
};

const CLIPS: Record<ModelKind, readonly string[]> = { scene: [], character: ['idle', 'walk'], object: [] };

const BUDGETS: Record<ModelKind, { triangles: number; joints: number | null; bytes: number }> = {
  character: { triangles: 8_000, joints: 64, bytes: 1_500_000 },
  object: { triangles: 2_000, joints: null, bytes: 300_000 },
  scene: { triangles: 60_000, joints: null, bytes: 5_000_000 },
};

/** How far, in metres, an origin or a floor may be off. */
const TOLERANCE = 0.02;
/** How far a character's height may be from the registry's, as a share of it. */
const HEIGHT_TOLERANCE = 0.2;

const TRIANGLES = 4;
const TRIANGLE_STRIP = 5;
const TRIANGLE_FAN = 6;

/**
 * Every rule of the contract the model file `glb` (of a model of `kind`) breaks, named by `file`.
 * `height` is the registry's, in metres, for a character.
 */
export function checkModel(bytes: Uint8Array, kind: ModelKind, file: string, height?: number): ContractBreach[] {
  const breaches: ContractBreach[] = [];
  const breach = (rule: string, message: string) => breaches.push({ file, rule, message });
  let glb: Glb;
  try {
    glb = readGlb(bytes);
  } catch (error) {
    breach('format: glb', error instanceof Error ? error.message : String(error));
    return breaches;
  }

  if (glb.version !== '2.0') breach('format: glTF 2.0', `is glTF "${glb.version}", not 2.0`);
  for (const extension of glb.extensionsRequired) {
    breach('format: extensionsRequired', `requires ${extension}; a model may not require an extension`);
  }
  for (const extension of glb.extensionsUsed.filter((used) => FORBIDDEN_EXTENSIONS.includes(used))) {
    breach(`format: ${extension}`, `uses ${extension}, whose decoder the CSP blocks`);
  }

  const names = new Set(glb.nodes.map((node) => node.name));
  for (const node of NODES[kind].filter((name) => !names.has(name))) {
    breach(`nodes: ${node}`, `has no node "${node}", which every ${kind} needs`);
  }
  if (kind === 'scene') checkCamera(glb, breach);

  const clips = new Set(glb.animations);
  for (const clip of CLIPS[kind].filter((name) => !clips.has(name))) {
    breach(`animations: ${clip}`, `has no "${clip}" animation, which every ${kind} needs`);
  }
  for (const clip of glb.animations.filter((name) => name === '' || name !== name.toLowerCase())) {
    breach('animations: names', `has an animation named "${clip}"; names are exact and lowercase`);
  }

  if (glb.images > 0 || glb.textures > 0) {
    breach('materials: textures', `has ${glb.images} images and ${glb.textures} textures; materials are base colour only`);
  }

  checkBudgets(glb, kind, breach);
  checkTransforms(glb, breach);
  checkOrigin(glb, kind, height, breach);
  return breaches;
}

type Breach = (rule: string, message: string) => void;

function checkCamera(glb: Glb, breach: Breach): void {
  const camera = glb.nodes.find((node) => node.name === 'cam_main');
  if (camera && (camera.camera === null || glb.cameras[camera.camera] !== 'perspective')) {
    breach('nodes: cam_main', 'has a "cam_main" node that is not a perspective camera');
  }
}

function checkBudgets(glb: Glb, kind: ModelKind, breach: Breach): void {
  const budget = BUDGETS[kind];
  const triangles = glb.meshes.flat().reduce((sum, primitive) => sum + trianglesIn(primitive.mode, primitive.vertices), 0);
  if (triangles > budget.triangles) {
    breach('budget: triangles', `has ${triangles} triangles; a ${kind} may have ${budget.triangles}`);
  }
  const joints = new Set(glb.skins.flat()).size;
  if (budget.joints !== null && joints > budget.joints) {
    breach('budget: joints', `has ${joints} joints; a ${kind} may have ${budget.joints}`);
  }
  if (glb.byteLength > budget.bytes) {
    breach('budget: bytes', `is ${glb.byteLength} bytes; a ${kind} may be ${budget.bytes}`);
  }
  if (glb.meshes.flat().some((primitive) => primitive.attributes.some((name) => /^(JOINTS|WEIGHTS)_[1-9]/.test(name)))) {
    breach('budget: joint influences', 'has more than 4 joint influences per vertex');
  }
}

function trianglesIn(mode: number, vertices: number): number {
  if (mode === TRIANGLES) return Math.floor(vertices / 3);
  if (mode === TRIANGLE_STRIP || mode === TRIANGLE_FAN) return Math.max(0, vertices - 2);
  return 0;
}

/** Scale 1 and no negative scale: every transform is applied before export. */
function checkTransforms(glb: Glb, breach: Breach): void {
  for (const node of glb.nodes) {
    const m = node.local;
    const scales = [0, 4, 8].map((c) => Math.hypot(m[c]!, m[c + 1]!, m[c + 2]!));
    if (scales.some((scale) => Math.abs(scale - 1) > 1e-4) || determinant(m) < 0) {
      breach('units: scale', `has the node "${node.name}" scaled; apply every transform before export`);
    }
  }
}

function checkOrigin(glb: Glb, kind: ModelKind, height: number | undefined, breach: Breach): void {
  if (kind === 'scene') {
    const floor = boundsOf(glb, (node) => node.name === 'floor');
    if (!floor) return;
    const flat = Math.abs(floor.min[1]) <= TOLERANCE && Math.abs(floor.max[1]) <= TOLERANCE;
    if (!flat) breach('origin: floor', 'has a "floor" that is not flat at y = 0');
    if (Math.abs(floor.max[2]) > TOLERANCE || floor.min[0] > 0 || floor.max[0] < 0) {
      breach('origin: scene', 'has its origin away from the front centre of its "floor"');
    }
    return;
  }
  const bounds = boundsOf(glb, () => true);
  if (!bounds) {
    breach('origin: bounds', 'has no mesh with POSITION bounds to place it by');
    return;
  }
  const { min, max } = bounds;
  if (Math.abs(min[1]) > TOLERANCE || min[0] > 0 || max[0] < 0 || min[2] > 0 || max[2] < 0) {
    const where = kind === 'character' ? 'between its feet, on the ground' : 'at the centre of its resting base';
    breach('origin: base', `has its origin away from its base; it goes ${where} (y = 0)`);
  }
  if (kind === 'character' && height !== undefined) {
    const tall = max[1] - min[1];
    if (Math.abs(tall - height) > height * HEIGHT_TOLERANCE) {
      breach('origin: height', `is ${tall.toFixed(2)} m tall; the registry says about ${height} m`);
    }
  }
}

/** The bounds, in the default scene's rest pose, of the meshes of the nodes `which` picks, and their children's. */
function boundsOf(glb: Glb, which: (node: GlbNode) => boolean): { min: Vec3; max: Vec3 } | null {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const visit = (index: number, parent: Mat4, picked: boolean, depth: number) => {
    const node = glb.nodes[index];
    if (!node || depth > glb.nodes.length) return;
    const world = multiply(parent, node.local);
    const inside = picked || which(node);
    for (const primitive of inside && node.mesh !== null ? (glb.meshes[node.mesh] ?? []) : []) {
      if (!primitive.bounds) continue;
      for (const corner of corners(primitive.bounds)) {
        const point = transform(world, corner);
        for (let axis = 0; axis < 3; axis++) {
          min[axis] = Math.min(min[axis]!, point[axis]!);
          max[axis] = Math.max(max[axis]!, point[axis]!);
        }
      }
    }
    for (const child of node.children) visit(child, world, inside, depth + 1);
  };
  for (const root of glb.roots) visit(root, IDENTITY, false, 0);
  if (min[0] === Infinity) return null;
  return { min: [min[0]!, min[1]!, min[2]!], max: [max[0]!, max[1]!, max[2]!] };
}

function corners({ min, max }: { min: Vec3; max: Vec3 }): Vec3[] {
  return [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [
    i & 1 ? max[0] : min[0],
    i & 2 ? max[1] : min[1],
    i & 4 ? max[2] : min[2],
  ]);
}

const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** `a` times `b`, both column-major. */
function multiply(a: Mat4, b: Mat4): Mat4 {
  return Array.from({ length: 16 }, (_, i) => {
    const [column, row] = [Math.floor(i / 4), i % 4];
    let sum = 0;
    for (let k = 0; k < 4; k++) sum += a[k * 4 + row]! * b[column * 4 + k]!;
    return sum;
  });
}

function transform(m: Mat4, [x, y, z]: Vec3): Vec3 {
  return [
    m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
    m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
    m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
  ];
}

/** The determinant of `m`'s upper 3 × 3: negative for a mirroring transform. */
function determinant(m: Mat4): number {
  const [a, b, c, d, e, f, g, h, i] = [m[0]!, m[1]!, m[2]!, m[4]!, m[5]!, m[6]!, m[8]!, m[9]!, m[10]!];
  return a * (e * i - f * h) - d * (b * i - c * h) + g * (b * f - c * e);
}
