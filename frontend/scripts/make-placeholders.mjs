// Writes the placeholder 3D models (public/models/<kind>/<id>.glb) that follow the asset contract
// (docs/ARCHITECTURE.md, section 8), from faceted primitives in the STYLE.md palette:
//
//   node scripts/make-placeholders.mjs
//
// glTF JSON and buffers are written by hand, so there is no dependency. The output is committed
// and must not drift: tests/unit/placeholders.test.ts checks that this script writes the
// committed bytes. A designer's file replaces a placeholder at the same path (section 8).
//
// Each part is one node with one mesh, and its material is named after the part. Characters
// pivot their limbs and head at nodes, so the clips are node transform animations with no skin.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Base tones from docs/design/STYLE.md: the protagonist's table (board 2), the palette's
// accents and city, and the pub art's bartender (art/pub/scene.svg).
const COLOURS = {
  fur: '#D88A4A',
  muzzle: '#EBC9A4',
  hoodie: '#4F6A8A',
  jeans: '#26262C',
  'high-tops': '#E2DDD2',
  guitar: '#8A5A34',
  tape: '#5E5A62',
  feathers: '#2F2D35',
  beak: '#C99A54',
  eyes: '#E3C58A',
  apron: '#D9CDB4',
  paper: '#D9CDB4',
  ink: '#C8483B',
};

/** Every placeholder, by its path under public/. */
export function placeholders() {
  return {
    'models/characters/protagonist.glb': glb(protagonist()),
    'models/characters/bartender.glb': glb(bartender()),
    'models/objects/flyer.glb': glb(flyer()),
    'models/objects/broken-guitar.glb': glb(brokenGuitar()),
  };
}

// --- The models. Metres, +Y up, facing +Z: a character's right is -X. --------------------------

/** A lanky cat about 1.5 m tall with its ears, in a hoodie and high-tops, the guitar on its back. */
function protagonist() {
  const leg = (side) => ({
    name: `leg_${side}`,
    at: [side === 'l' ? 0.075 : -0.075, 0, 0],
    part: 'jeans',
    shape: frustum(5, 0.065, 0.055, 0.54, [0, -0.56, 0]),
    children: [{ name: `shoe_${side}`, part: 'high-tops', shape: box([-0.06, -0.62, -0.06], [0.12, 0.09, 0.18]) }],
  });
  const arm = (side) => ({
    name: `arm_${side}`,
    at: [side === 'l' ? 0.18 : -0.18, 0.4, 0],
    part: 'hoodie',
    shape: frustum(4, 0.04, 0.05, 0.5, [0, -0.5, 0]),
    children: [
      { name: `paw_${side}`, part: 'fur', shape: box([-0.035, -0.57, -0.035], [0.07, 0.07, 0.07]) },
      ...(side === 'r' ? [{ name: 'anchor_hand_r', at: [0, -0.56, 0.04] }] : []),
    ],
  });
  return {
    name: 'protagonist',
    children: [
      {
        name: 'hips',
        at: [0, 0.62, 0],
        children: [
          leg('l'),
          leg('r'),
          {
            name: 'tail',
            at: [0, 0.04, -0.1],
            part: 'fur',
            shape: rotateX(frustum(4, 0.03, 0.012, 0.45), -2.3),
          },
          {
            name: 'torso',
            part: 'hoodie',
            shape: frustum(6, 0.16, 0.13, 0.46, [0, -0.04, 0]),
            children: [
              arm('l'),
              arm('r'),
              {
                name: 'guitar',
                part: 'guitar',
                shape: [...box([-0.13, -0.02, -0.25], [0.26, 0.34, 0.08]), ...box([-0.025, 0.32, -0.23], [0.05, 0.22, 0.04])],
              },
              { name: 'tape', part: 'tape', shape: box([-0.035, 0.44, -0.24], [0.07, 0.05, 0.06]) },
              { name: 'anchor_back', at: [0, 0.2, -0.22] },
              {
                name: 'head',
                at: [0, 0.47, 0.01],
                part: 'fur',
                shape: frustum(6, 0.12, 0.1, 0.24),
                children: [
                  { name: 'muzzle', at: [0, 0.07, 0.09], part: 'muzzle', shape: rotateX(frustum(5, 0.06, 0.02, 0.1), Math.PI / 2) },
                  { name: 'ear_l', at: [0.065, 0.22, 0], part: 'fur', shape: frustum(3, 0.05, 0, 0.17) },
                  { name: 'ear_r', at: [-0.065, 0.22, 0], part: 'fur', shape: frustum(3, 0.05, 0, 0.17) },
                  { name: 'anchor_head', at: [0, 0.5, 0] },
                ],
              },
            ],
          },
        ],
      },
    ],
    clips: clips({ hips: [0, 0.62, 0], legs: ['leg_l', 'leg_r'], arms: ['arm_l', 'arm_r'] }),
  };
}

/** A tall crow in an apron, about 1.55 m to the top of its crest; its wings are its arms. */
function bartender() {
  const leg = (side) => ({
    name: `leg_${side}`,
    at: [side === 'l' ? 0.08 : -0.08, 0, 0],
    part: 'beak',
    shape: frustum(4, 0.03, 0.025, 0.5, [0, -0.52, 0]),
    children: [{ name: `foot_${side}`, part: 'beak', shape: box([-0.05, -0.55, -0.04], [0.1, 0.03, 0.16]) }],
  });
  const wing = (side) => ({
    name: `wing_${side}`,
    at: [side === 'l' ? 0.21 : -0.21, 0.5, 0],
    part: 'feathers',
    shape: frustum(3, 0.03, 0.07, 0.48, [0, -0.48, 0]),
    children: side === 'r' ? [{ name: 'anchor_hand_r', at: [0, -0.5, 0.04] }] : [],
  });
  return {
    name: 'bartender',
    children: [
      {
        name: 'hips',
        at: [0, 0.55, 0],
        children: [
          leg('l'),
          leg('r'),
          {
            name: 'torso',
            part: 'feathers',
            shape: frustum(6, 0.22, 0.15, 0.6, [0, -0.05, 0]),
            children: [
              wing('l'),
              wing('r'),
              { name: 'apron', part: 'apron', shape: box([-0.15, -0.04, 0.2], [0.3, 0.42, 0.02]) },
              { name: 'anchor_back', at: [0, 0.3, -0.22] },
              {
                name: 'head',
                at: [0, 0.57, 0],
                part: 'feathers',
                shape: frustum(5, 0.13, 0.1, 0.26),
                children: [
                  { name: 'beak', at: [0, 0.12, 0.08], part: 'beak', shape: rotateX(frustum(4, 0.05, 0, 0.2), Math.PI / 2) },
                  { name: 'eyes', part: 'eyes', shape: box([-0.09, 0.16, 0.07], [0.18, 0.03, 0.03]) },
                  { name: 'crest', at: [0, 0.26, -0.02], part: 'feathers', shape: rotateX(frustum(3, 0.05, 0, 0.17), -0.4) },
                  { name: 'anchor_head', at: [0, 0.52, 0] },
                ],
              },
            ],
          },
        ],
      },
    ],
    clips: clips({ hips: [0, 0.55, 0], legs: ['leg_l', 'leg_r'], arms: ['wing_l', 'wing_r'] }),
  };
}

/** The open mic flyer: a flat card standing on its bottom edge. */
function flyer() {
  return {
    name: 'flyer',
    part: 'paper',
    shape: box([-0.105, 0, -0.002], [0.21, 0.297, 0.004]),
    children: [{ name: 'headline', part: 'ink', shape: box([-0.08, 0.2, 0.002], [0.16, 0.05, 0.002]) }],
  };
}

/** The broken guitar standing on its body: the neck snapped and taped, the headstock hanging by the strings. */
function brokenGuitar() {
  return {
    name: 'broken-guitar',
    part: 'guitar',
    shape: [...box([-0.18, 0, -0.05], [0.36, 0.45, 0.1]), ...box([-0.03, 0.45, -0.02], [0.06, 0.28, 0.04])],
    children: [
      { name: 'tape', part: 'tape', shape: box([-0.04, 0.7, -0.03], [0.08, 0.05, 0.06]) },
      { name: 'headstock', part: 'guitar', shape: rotateZ(box([-0.035, -0.16, -0.015], [0.07, 0.16, 0.03]), 0.3, [0.06, 0.75, 0]) },
    ],
  };
}

/**
 * A character's clips, moving its pivot nodes: `idle` and `walk` loop, `talk` loops, and
 * `pickup` and `use` play once over 0.6 s. Walking is in place: the game moves the character.
 */
function clips({ hips, legs: [legL, legR], arms: [armL, armR] }) {
  const bob = (lift) => hips.map((v, axis) => (axis === 1 ? v + lift : v));
  return [
    { name: 'idle', tracks: [{ node: 'torso', path: 'translation', times: [0, 1, 2], values: [[0, 0, 0], [0, 0.012, 0], [0, 0, 0]] }] },
    {
      name: 'walk',
      tracks: [
        swing(legL, [0, 0.4, 0.8], [-0.45, 0.45, -0.45]),
        swing(legR, [0, 0.4, 0.8], [0.45, -0.45, 0.45]),
        swing(armL, [0, 0.4, 0.8], [0.35, -0.35, 0.35]),
        swing(armR, [0, 0.4, 0.8], [-0.35, 0.35, -0.35]),
        { node: 'hips', path: 'translation', times: [0, 0.2, 0.4, 0.6, 0.8], values: [hips, bob(0.02), hips, bob(0.02), hips] },
      ],
    },
    { name: 'talk', tracks: [swing('head', [0, 0.3, 0.6], [0, -0.1, 0])] },
    { name: 'pickup', tracks: [swing('torso', [0, 0.3, 0.6], [0, 0.5, 0]), swing(armR, [0, 0.3, 0.6], [0, -0.9, 0])] },
    { name: 'use', tracks: [swing(armR, [0, 0.3, 0.6], [0, -1.3, 0])] },
  ];
}

/** A rotation track about X: a positive angle tips +Y towards +Z (forwards). */
function swing(node, times, angles) {
  return { node, path: 'rotation', times, values: angles.map((a) => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)]) };
}

// --- Shapes: lists of triangles, each three [x, y, z] corners. -------------------------------

function box([x0, y0, z0], [w, h, d]) {
  const [x1, y1, z1] = [x0 + w, y0 + h, z0 + d];
  const c = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]];
  return outward(quads.flatMap(([a, b, e, f]) => [[c[a], c[b], c[e]], [c[a], c[e], c[f]]]));
}

/** A faceted upright frustum of `sides` sides, from radius `bottom` to `top` (0 for a cone), standing on `at`. */
function frustum(sides, bottom, top, height, [x, y, z] = [0, 0, 0]) {
  const ring = (radius, h) =>
    Array.from({ length: sides }, (_, i) => {
      const a = (2 * Math.PI * i) / sides;
      return [x + radius * Math.sin(a), y + h, z + radius * Math.cos(a)];
    });
  const [low, high] = [ring(bottom, 0), ring(top, height)];
  const triangles = [];
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    triangles.push([low[i], low[j], high[j]]);
    if (top > 0) triangles.push([low[i], high[j], high[i]]);
    triangles.push([[x, y, z], low[j], low[i]]);
    if (top > 0) triangles.push([[x, y + height, z], high[i], high[j]]);
  }
  return outward(triangles);
}

/** Winds every triangle of a convex shape counter-clockwise seen from outside. */
function outward(triangles) {
  const corners = triangles.flat();
  const centre = [0, 1, 2].map((axis) => corners.reduce((sum, p) => sum + p[axis], 0) / corners.length);
  return triangles.map((t) => {
    const middle = [0, 1, 2].map((axis) => (t[0][axis] + t[1][axis] + t[2][axis]) / 3);
    return dot(normal(t), sub(middle, centre)) < 0 ? [t[0], t[2], t[1]] : t;
  });
}

function rotateX(triangles, angle) {
  const [s, c] = [Math.sin(angle), Math.cos(angle)];
  return triangles.map((t) => t.map(([x, y, z]) => [x, y * c - z * s, y * s + z * c]));
}

function rotateZ(triangles, angle, [ox, oy, oz]) {
  const [s, c] = [Math.sin(angle), Math.cos(angle)];
  return triangles.map((t) => t.map(([x, y, z]) => [ox + x * c - y * s, oy + x * s + y * c, oz + z]));
}

const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);

function normal([a, b, c]) {
  const [u, v] = [sub(b, a), sub(c, a)];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const length = Math.hypot(...n) || 1;
  return n.map((x) => x / length);
}

// --- The glb writer. -----------------------------------------------------------------------

const FLOAT = 5126;
const ARRAY_BUFFER = 34962;

function glb(model) {
  const chunks = [];
  let length = 0;
  const bufferViews = [];
  const accessors = [];
  const accessor = (values, type, { bounds = false, target } = {}) => {
    const size = { SCALAR: 1, VEC3: 3, VEC4: 4 }[type];
    const data = Float32Array.from(values.flat());
    chunks.push(new Uint8Array(data.buffer));
    bufferViews.push({ buffer: 0, byteOffset: length, byteLength: data.byteLength, ...(target && { target }) });
    length += data.byteLength;
    const entry = { bufferView: bufferViews.length - 1, componentType: FLOAT, count: data.length / size, type };
    if (bounds) {
      const columns = [...Array(size).keys()].map((c) => data.filter((_, i) => i % size === c));
      entry.min = columns.map((column) => Math.min(...column));
      entry.max = columns.map((column) => Math.max(...column));
    }
    accessors.push(entry);
    return accessors.length - 1;
  };

  const materials = [];
  const material = (part) => {
    const known = materials.findIndex((m) => m.name === part);
    if (known >= 0) return known;
    const hex = COLOURS[part];
    const rgb = [1, 3, 5].map((at) => round(srgbToLinear(parseInt(hex.slice(at, at + 2), 16) / 255)));
    materials.push({ name: part, pbrMetallicRoughness: { baseColorFactor: [...rgb, 1], metallicFactor: 0, roughnessFactor: 1 } });
    return materials.length - 1;
  };

  const nodes = [];
  const meshes = [];
  const add = (part) => {
    const node = { name: part.name };
    nodes.push(node);
    if (part.at) node.translation = part.at;
    if (part.shape) {
      const triangles = part.shape.map((t) => t.map((p) => p.map(round)));
      const normals = triangles.flatMap((t) => {
        const n = normal(t).map(round);
        return [n, n, n];
      });
      const attributes = {
        POSITION: accessor(triangles.flat(), 'VEC3', { bounds: true, target: ARRAY_BUFFER }),
        NORMAL: accessor(normals, 'VEC3', { target: ARRAY_BUFFER }),
      };
      meshes.push({ name: part.name, primitives: [{ attributes, material: material(part.part) }] });
      node.mesh = meshes.length - 1;
    }
    const children = (part.children ?? []).map(add);
    if (children.length) node.children = children;
    return nodes.indexOf(node);
  };
  add(model);

  const animations = (model.clips ?? []).map(({ name, tracks }) => ({
    name,
    samplers: tracks.map(({ times, values }) => ({
      input: accessor(times, 'SCALAR', { bounds: true }),
      output: accessor(values.map((v) => v.map(round)), values[0].length === 4 ? 'VEC4' : 'VEC3'),
    })),
    channels: tracks.map(({ node, path }, sampler) => ({
      sampler,
      target: { node: nodes.findIndex((n) => n.name === node), path },
    })),
  }));

  const bin = concat(chunks);
  const gltf = {
    asset: { version: '2.0', generator: 'punland scripts/make-placeholders.mjs' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes,
    meshes,
    materials,
    ...(animations.length && { animations }),
    accessors,
    bufferViews,
    buffers: [{ byteLength: bin.byteLength }],
  };
  const json = pad(new TextEncoder().encode(JSON.stringify(gltf)), 0x20);
  return concat([
    words(0x46546c67, 2, 12 + 8 + json.byteLength + 8 + bin.byteLength),
    words(json.byteLength, 0x4e4f534a),
    json,
    words(bin.byteLength, 0x004e4942),
    bin,
  ]);
}

/** To 0.1 mm, so the files don't hang on the last bits of floating point. */
function round(value) {
  return Math.round(value * 1e4) / 1e4 + 0;
}

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function words(...values) {
  return new Uint8Array(Uint32Array.from(values).buffer);
}

function pad(bytes, fill) {
  const padded = new Uint8Array(Math.ceil(bytes.byteLength / 4) * 4).fill(fill);
  padded.set(bytes);
  return padded;
}

function concat(parts) {
  const all = new Uint8Array(parts.reduce((n, part) => n + part.byteLength, 0));
  let at = 0;
  for (const part of parts) {
    all.set(part, at);
    at += part.byteLength;
  }
  return all;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
  for (const [path, bytes] of Object.entries(placeholders())) {
    mkdirSync(dirname(join(publicDir, path)), { recursive: true });
    writeFileSync(join(publicDir, path), bytes);
    console.log(`public/${path}  ${bytes.byteLength} bytes`);
  }
}
