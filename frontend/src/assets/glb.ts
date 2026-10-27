/**
 * A glb file read with no dependency (glTF 2.0, binary): the 12-byte header, the JSON chunk and
 * the triangles in the binary chunk, reduced to the parts the asset contract (contract.ts) checks.
 */

export type Vec3 = readonly [number, number, number];
/** Column-major, as glTF has it. */
export type Mat4 = readonly number[];

export interface GlbNode {
  name: string;
  mesh: number | null;
  camera: number | null;
  children: readonly number[];
  /** Its transform relative to its parent, from `matrix` or translation, rotation and scale. */
  local: Mat4;
}

export interface GlbPrimitive {
  /** The glTF primitive mode: 4 is triangles. */
  mode: number;
  /** How many vertices it draws: its indices' count, else its positions'. */
  vertices: number;
  /** Its POSITION accessor's bounds, if it gives them. */
  bounds: { min: Vec3; max: Vec3 } | null;
  attributes: readonly string[];
  /**
   * Its triangles' corners, in its node's space, read from the binary chunk: empty unless it is
   * drawn as triangles from float positions in the file's own buffer.
   */
  triangles: readonly Triangle[];
}

export type Triangle = readonly [Vec3, Vec3, Vec3];

export interface GlbCamera {
  /** E.g. `perspective`. */
  type: string;
  /** A perspective camera's vertical field of view, in radians. */
  yfov: number | null;
}

export interface Glb {
  /** The whole file's length in bytes, from its header. */
  byteLength: number;
  version: string;
  extensionsUsed: readonly string[];
  extensionsRequired: readonly string[];
  nodes: readonly GlbNode[];
  /** The nodes at the root of the default scene. */
  roots: readonly number[];
  meshes: readonly (readonly GlbPrimitive[])[];
  cameras: readonly GlbCamera[];
  /** Each skin's joints, as node indices. */
  skins: readonly (readonly number[])[];
  /** Each animation's name. */
  animations: readonly string[];
  images: number;
  textures: number;
}

const MAGIC = 0x46546c67; // "glTF"
const JSON_CHUNK = 0x4e4f534a; // "JSON"
const BIN_CHUNK = 0x004e4942; // "BIN"

/** Reads a glb file, or throws an Error saying why it isn't one. */
export function readGlb(bytes: Uint8Array): Glb {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 20 || data.getUint32(0, true) !== MAGIC) throw new Error('is not a glb file');
  const container = data.getUint32(4, true);
  if (container !== 2) throw new Error(`is glb container version ${container}, not 2`);
  const byteLength = data.getUint32(8, true);
  if (byteLength !== bytes.byteLength) throw new Error(`says it is ${byteLength} bytes long, but is ${bytes.byteLength}`);
  const jsonLength = data.getUint32(12, true);
  if (data.getUint32(16, true) !== JSON_CHUNK || 20 + jsonLength > byteLength) {
    throw new Error('does not start with a JSON chunk');
  }
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
  } catch {
    throw new Error('has a JSON chunk that is not JSON');
  }
  if (!isObject(json)) throw new Error('has a JSON chunk that is not an object');
  return { byteLength, ...readGltf(json, binChunk(bytes, 20 + jsonLength)) };
}

/** The binary chunk that follows the JSON chunk at `at`, if there is one. */
function binChunk(bytes: Uint8Array, at: number): DataView | null {
  if (at + 8 > bytes.byteLength) return null;
  const data = new DataView(bytes.buffer, bytes.byteOffset + at, 8);
  const length = data.getUint32(0, true);
  if (data.getUint32(4, true) !== BIN_CHUNK || at + 8 + length > bytes.byteLength) return null;
  return new DataView(bytes.buffer, bytes.byteOffset + at + 8, length);
}

function readGltf(json: Record<string, unknown>, bin: DataView | null): Omit<Glb, 'byteLength'> {
  const asset = isObject(json.asset) ? json.asset : {};
  const scenes = objects(json.scenes);
  const scene = scenes[integer(json.scene) ?? 0];
  return {
    version: typeof asset.version === 'string' ? asset.version : '',
    extensionsUsed: strings(json.extensionsUsed),
    extensionsRequired: strings(json.extensionsRequired),
    nodes: objects(json.nodes).map(readNode),
    roots: scene ? integers(scene.nodes) : [],
    meshes: objects(json.meshes).map((mesh) => objects(mesh.primitives).map((p) => readPrimitive(p, json, bin))),
    cameras: objects(json.cameras).map(readCamera),
    skins: objects(json.skins).map((skin) => integers(skin.joints)),
    animations: objects(json.animations).map((animation) => (typeof animation.name === 'string' ? animation.name : '')),
    images: objects(json.images).length,
    textures: objects(json.textures).length,
  };
}

function readNode(node: Record<string, unknown>): GlbNode {
  return {
    name: typeof node.name === 'string' ? node.name : '',
    mesh: integer(node.mesh),
    camera: integer(node.camera),
    children: integers(node.children),
    local: numbers(node.matrix, 16) ?? compose(node),
  };
}

function readCamera(camera: Record<string, unknown>): GlbCamera {
  const perspective = isObject(camera.perspective) ? camera.perspective : {};
  return {
    type: typeof camera.type === 'string' ? camera.type : '',
    yfov: isNumber(perspective.yfov) ? perspective.yfov : null,
  };
}

const TRIANGLES = 4;

function readPrimitive(
  primitive: Record<string, unknown>,
  json: Record<string, unknown>,
  bin: DataView | null,
): GlbPrimitive {
  const accessors = objects(json.accessors);
  const attributes = isObject(primitive.attributes) ? primitive.attributes : {};
  const position = accessors[integer(attributes.POSITION) ?? -1];
  const indices = accessors[integer(primitive.indices) ?? -1];
  const min = numbers(position?.min, 3);
  const max = numbers(position?.max, 3);
  const mode = integer(primitive.mode) ?? TRIANGLES;
  return {
    mode,
    vertices: integer((indices ?? position)?.count) ?? 0,
    bounds: min && max ? { min: [min[0]!, min[1]!, min[2]!], max: [max[0]!, max[1]!, max[2]!] } : null,
    attributes: Object.keys(attributes),
    triangles: mode === TRIANGLES && position && bin ? readTriangles(json, bin, position, indices) : [],
  };
}

const UNSIGNED_BYTE = 5121;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;
const FLOAT = 5126;
const COMPONENT_BYTES: Readonly<Record<number, number>> = {
  [UNSIGNED_BYTE]: 1,
  [UNSIGNED_SHORT]: 2,
  [UNSIGNED_INT]: 4,
  [FLOAT]: 4,
};

function readTriangles(
  json: Record<string, unknown>,
  bin: DataView,
  position: Record<string, unknown>,
  indices: Record<string, unknown> | undefined,
): Triangle[] {
  if (position.componentType !== FLOAT || position.type !== 'VEC3') return [];
  const corners = readAccessor(json, bin, position, 3)?.map(([x, y, z]): Vec3 => [x!, y!, z!]);
  const order = indices ? readAccessor(json, bin, indices, 1)?.map(([i]) => i!) : corners?.map((_, i) => i);
  if (!corners || !order) return [];
  const triangles: Triangle[] = [];
  for (let i = 0; i + 2 < order.length; i += 3) {
    const [a, b, c] = [corners[order[i]!], corners[order[i + 1]!], corners[order[i + 2]!]];
    if (!a || !b || !c) return [];
    triangles.push([a, b, c]);
  }
  return triangles;
}

/** An accessor's elements, each `size` components, or null if they are not all in the binary chunk. */
function readAccessor(json: Record<string, unknown>, bin: DataView, accessor: Record<string, unknown>, size: number): number[][] | null {
  const view = objects(json.bufferViews)[integer(accessor.bufferView) ?? -1];
  const type = integer(accessor.componentType) ?? -1;
  const bytes = COMPONENT_BYTES[type];
  const count = integer(accessor.count);
  if (!view || bytes === undefined || count === null || (integer(view.buffer) ?? 0) !== 0) return null;
  const stride = integer(view.byteStride) ?? bytes * size;
  const start = (integer(view.byteOffset) ?? 0) + (integer(accessor.byteOffset) ?? 0);
  if (count > 0 && start + stride * (count - 1) + bytes * size > bin.byteLength) return null;
  const read = (at: number) => {
    if (type === FLOAT) return bin.getFloat32(at, true);
    if (type === UNSIGNED_INT) return bin.getUint32(at, true);
    if (type === UNSIGNED_SHORT) return bin.getUint16(at, true);
    return bin.getUint8(at);
  };
  return Array.from({ length: count }, (_, i) =>
    Array.from({ length: size }, (_, c) => read(start + i * stride + c * bytes)),
  );
}

/** A node's translation, rotation (a unit quaternion) and scale as one matrix. */
function compose(node: Record<string, unknown>): Mat4 {
  const [tx, ty, tz] = vector(node.translation, [0, 0, 0]);
  const [x, y, z, w] = vector(node.rotation, [0, 0, 0, 1]);
  const [sx, sy, sz] = vector(node.scale, [1, 1, 1]);
  return [
    (1 - 2 * (y * y + z * z)) * sx,
    2 * (x * y + z * w) * sx,
    2 * (x * z - y * w) * sx,
    0,
    2 * (x * y - z * w) * sy,
    (1 - 2 * (x * x + z * z)) * sy,
    2 * (y * z + x * w) * sy,
    0,
    2 * (x * z + y * w) * sz,
    2 * (y * z - x * w) * sz,
    (1 - 2 * (x * x + y * y)) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function objects(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function isInteger(value: unknown): value is number {
  return Number.isInteger(value);
}

function integer(value: unknown): number | null {
  return isInteger(value) ? value : null;
}

function integers(value: unknown): number[] {
  return Array.isArray(value) ? value.filter(isInteger) : [];
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function numbers(value: unknown, length: number): number[] | null {
  return Array.isArray(value) && value.length === length && value.every(isNumber) ? value : null;
}

/** `value` if it is a list of numbers as long as `fallback`, else `fallback`. */
function vector<T extends readonly number[]>(value: unknown, fallback: T): T {
  return (numbers(value, fallback.length) as T | null) ?? fallback;
}
