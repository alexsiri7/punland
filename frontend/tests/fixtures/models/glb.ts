/**
 * Model fixtures for the acceptance tests of the models spec: glb files written from boxes,
 * with no dependency. `fixtures` follow the asset contract (docs/ARCHITECTURE.md, section 8)
 * and `breaches` each break one of its rules. The tests build them in memory, so the bytes
 * never drift from this file.
 */

import { concat, container, pad, srgbToLinear } from '../../../scripts/glb-container.mjs';

type Vec3 = [number, number, number];

interface Box {
  name: string;
  /** Lower, left, back corner, and size, in metres. */
  from: Vec3;
  size: Vec3;
  color: string;
  material: string;
  /** Its node's scale, left unapplied. */
  scale?: Vec3;
}

export interface Model {
  boxes: Box[];
  /** Empty nodes: anchors, and the scene's spawn points. */
  empties?: { name: string; at: Vec3 }[];
  camera?: { name: string; at: Vec3; type?: 'perspective' | 'orthographic' };
  clips?: string[];
  version?: string;
  extensions?: string[];
  extensionsRequired?: string[];
  texture?: boolean;
  /** Extra triangles in one more mesh, to go over a budget. */
  bulk?: number;
  /** Extra unused bytes in the binary chunk, to go over a budget. */
  filler?: number;
  /** Empty nodes in one skin. */
  joints?: number;
  /** Joint influences per vertex on every box, in sets of four. */
  influences?: number;
}

export const CHARACTER: Model = {
  boxes: [
    { name: 'legs', from: [-0.15, 0, -0.1], size: [0.3, 0.6, 0.2], color: '#2E3A4F', material: 'jeans' },
    { name: 'body', from: [-0.2, 0.6, -0.12], size: [0.4, 0.5, 0.24], color: '#C8553D', material: 'hoodie' },
    { name: 'head', from: [-0.15, 1.1, -0.15], size: [0.3, 0.3, 0.3], color: '#E8A87C', material: 'fur' },
    { name: 'ears', from: [-0.15, 1.4, -0.05], size: [0.3, 0.1, 0.1], color: '#E8A87C', material: 'fur' },
  ],
  empties: [
    { name: 'anchor_head', at: [0, 1.55, 0] },
    { name: 'anchor_hand_r', at: [-0.25, 0.8, 0] },
    { name: 'anchor_back', at: [0, 0.9, -0.15] },
  ],
  clips: ['idle', 'walk', 'talk'],
};

/**
 * The opening room's shape: a floor whose front centre is the origin, the street's back wall,
 * the door and the board as hit boxes, and the camera framing the floor from the front.
 */
export function scene(backdrop = '#5A4E7C'): Model {
  return {
    boxes: [
      { name: 'floor', from: [-8, 0, -5], size: [16, 0, 5], color: '#3B3A4A', material: 'pavement' },
      { name: 'backdrop', from: [-14, 0, -5.4], size: [28, 9, 0.2], color: backdrop, material: 'brick' },
      { name: 'hit_door', from: [0.2, 0, -5.2], size: [0.9, 2.2, 0.2], color: '#5B3A29', material: 'door' },
      { name: 'hit_board', from: [1.7, 0, -4.2], size: [0.6, 0.8, 0.1], color: '#F2E3C6', material: 'board' },
    ],
    camera: { name: 'cam_main', at: [0, 1.6, 4] },
  };
}

export const fixtures = {
  /** A contract-valid character, unlike the placeholder protagonist. */
  character: () => glb(CHARACTER),
  /** A contract-valid opening scene. */
  scene: () => glb(scene()),
  /** The opening scene with one large #FF00FF backdrop behind everything. */
  magentaScene: () => glb(scene('#FF00FF')),
};

/** Character models that each break one rule of the contract, and what that rule is about. */
export const breaches: { file: string; rule: RegExp; glb: () => Uint8Array }[] = [
  {
    file: 'characters/no-anchor-head.glb',
    rule: /anchor_head/,
    glb: () => glb({ ...CHARACTER, empties: CHARACTER.empties!.filter((e) => e.name !== 'anchor_head') }),
  },
  { file: 'characters/no-walk.glb', rule: /walk/, glb: () => glb({ ...CHARACTER, clips: ['idle', 'talk'] }) },
  {
    file: 'characters/draco.glb',
    rule: /draco/i,
    glb: () => glb({ ...CHARACTER, extensions: ['KHR_draco_mesh_compression'] }),
  },
  { file: 'characters/textured.glb', rule: /texture/i, glb: () => glb({ ...CHARACTER, texture: true }) },
  { file: 'characters/over-budget.glb', rule: /triangle/i, glb: () => glb({ ...CHARACTER, bulk: 8_001 }) },
];

// A 1 x 1 PNG, for the textured breach.
const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);

const FLOAT = 5126;
const UNSIGNED_SHORT = 5123;

export function glb(model: Model): Uint8Array {
  const chunks: Uint8Array[] = [];
  let length = 0;
  const bufferViews: object[] = [];
  const accessors: object[] = [];
  const view = (bytes: Uint8Array): number => {
    const padding = (4 - (length % 4)) % 4;
    chunks.push(new Uint8Array(padding), bytes);
    length += padding;
    bufferViews.push({ buffer: 0, byteOffset: length, byteLength: bytes.byteLength });
    length += bytes.byteLength;
    return bufferViews.length - 1;
  };
  const accessor = (
    data: Float32Array | Uint16Array,
    type: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4',
    minMax = false,
  ): number => {
    const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[type];
    const entry: Record<string, unknown> = {
      bufferView: view(new Uint8Array(data.buffer)),
      componentType: data instanceof Float32Array ? FLOAT : UNSIGNED_SHORT,
      count: data.length / size,
      type,
    };
    if (minMax) {
      const columns = [...Array(size).keys()].map((c) => data.filter((_, i) => i % size === c));
      entry.min = columns.map((column) => Math.min(...column));
      entry.max = columns.map((column) => Math.max(...column));
    }
    accessors.push(entry);
    return accessors.length - 1;
  };

  const materials: object[] = [];
  const materialIndex = new Map<string, number>();
  const material = (name: string, color: string): number => {
    const known = materialIndex.get(name);
    if (known !== undefined) return known;
    const rgb = [1, 3, 5].map((at) => srgbToLinear(parseInt(color.slice(at, at + 2), 16) / 255));
    materials.push({
      name,
      pbrMetallicRoughness: {
        baseColorFactor: [...rgb, 1],
        metallicFactor: 0,
        roughnessFactor: 1,
        ...(model.texture ? { baseColorTexture: { index: 0 } } : {}),
      },
    });
    materialIndex.set(name, materials.length - 1);
    return materials.length - 1;
  };

  const meshes: object[] = [];
  const nodes: Record<string, unknown>[] = [];
  for (const box of model.boxes) {
    const { positions, normals, indices } = boxGeometry(box.from, box.size);
    const attributes: Record<string, number> = {
      POSITION: accessor(positions, 'VEC3', true),
      NORMAL: accessor(normals, 'VEC3'),
    };
    if (model.texture)
      attributes.TEXCOORD_0 = accessor(
        new Float32Array(48).map((_, i) => [0, 0, 1, 0, 1, 1, 0, 1][i % 8]!),
        'VEC2',
      );
    for (let set = 0; set < (model.influences ?? 0) / 4; set++) {
      attributes[`JOINTS_${set}`] = accessor(new Uint16Array(96), 'VEC4');
      attributes[`WEIGHTS_${set}`] = accessor(new Float32Array(96), 'VEC4');
    }
    meshes.push({
      name: box.name,
      primitives: [
        {
          attributes,
          indices: accessor(indices, 'SCALAR'),
          material: material(box.material, box.color),
        },
      ],
    });
    nodes.push({ name: box.name, mesh: meshes.length - 1, ...(box.scale ? { scale: box.scale } : {}) });
  }
  if (model.bulk) {
    const positions = Float32Array.of(0, 0, 0, 0.01, 0, 0, 0, 0.01, 0);
    const indices = new Uint16Array(model.bulk * 3).map((_, i) => i % 3);
    meshes.push({
      name: 'bulk',
      primitives: [
        { attributes: { POSITION: accessor(positions, 'VEC3', true) }, indices: accessor(indices, 'SCALAR') },
      ],
    });
    nodes.push({ name: 'bulk', mesh: meshes.length - 1 });
  }
  for (const empty of model.empties ?? []) nodes.push({ name: empty.name, translation: empty.at });
  const cameras: object[] = [];
  if (model.camera) {
    cameras.push(
      model.camera.type === 'orthographic'
        ? { type: 'orthographic', orthographic: { xmag: 8, ymag: 4, znear: 0.1, zfar: 100 } }
        : { type: 'perspective', perspective: { aspectRatio: 2, yfov: 0.7, znear: 0.1, zfar: 100 } },
    );
    nodes.push({ name: model.camera.name, camera: 0, translation: model.camera.at });
  }

  const skins: object[] = [];
  if (model.joints) {
    const first = nodes.length;
    for (let j = 0; j < model.joints; j++) nodes.push({ name: `joint_${j}` });
    skins.push({ joints: [...Array(model.joints).keys()].map((j) => first + j) });
  }
  if (model.filler) view(new Uint8Array(model.filler));

  // Each clip bobs the first box up and down in place, over one second.
  const animations = (model.clips ?? []).map((name) => ({
    name,
    samplers: [
      {
        input: accessor(Float32Array.of(0, 0.5, 1), 'SCALAR', true),
        output: accessor(Float32Array.of(0, 0, 0, 0, 0.02, 0, 0, 0, 0), 'VEC3'),
      },
    ],
    channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }],
  }));

  const gltf: Record<string, unknown> = {
    asset: { version: model.version ?? '2.0', generator: 'punland acceptance-test fixtures' },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: 0 }],
  };
  if (cameras.length) gltf.cameras = cameras;
  if (skins.length) gltf.skins = skins;
  if (animations.length) gltf.animations = animations;
  if (model.texture) {
    gltf.images = [{ bufferView: view(PNG), mimeType: 'image/png' }];
    gltf.samplers = [{}];
    gltf.textures = [{ source: 0, sampler: 0 }];
  }
  if (model.extensions) gltf.extensionsUsed = model.extensions;
  if (model.extensionsRequired) gltf.extensionsRequired = model.extensionsRequired;
  const bin = pad(concat(chunks), 0);
  (gltf.buffers as { byteLength: number }[])[0]!.byteLength = bin.byteLength;
  return container(gltf, bin);
}

function boxGeometry(from: Vec3, size: Vec3) {
  const [x0, y0, z0] = from;
  const [x1, y1, z1] = [x0 + size[0], y0 + size[1], z0 + size[2]];
  // Each face: its normal, and its corners counter-clockwise seen from outside.
  const faces: [Vec3, Vec3[]][] = [
    [
      [1, 0, 0],
      [
        [x1, y0, z1],
        [x1, y0, z0],
        [x1, y1, z0],
        [x1, y1, z1],
      ],
    ],
    [
      [-1, 0, 0],
      [
        [x0, y0, z0],
        [x0, y0, z1],
        [x0, y1, z1],
        [x0, y1, z0],
      ],
    ],
    [
      [0, 1, 0],
      [
        [x0, y1, z1],
        [x1, y1, z1],
        [x1, y1, z0],
        [x0, y1, z0],
      ],
    ],
    [
      [0, -1, 0],
      [
        [x0, y0, z0],
        [x1, y0, z0],
        [x1, y0, z1],
        [x0, y0, z1],
      ],
    ],
    [
      [0, 0, 1],
      [
        [x0, y0, z1],
        [x1, y0, z1],
        [x1, y1, z1],
        [x0, y1, z1],
      ],
    ],
    [
      [0, 0, -1],
      [
        [x1, y0, z0],
        [x0, y0, z0],
        [x0, y1, z0],
        [x1, y1, z0],
      ],
    ],
  ];
  return {
    positions: Float32Array.from(faces.flatMap(([, corners]) => corners.flat())),
    normals: Float32Array.from(faces.flatMap(([normal]) => [normal, normal, normal, normal].flat())),
    indices: Uint16Array.from(faces.flatMap((_, f) => [0, 1, 2, 0, 2, 3].map((i) => f * 4 + i))),
  };
}
