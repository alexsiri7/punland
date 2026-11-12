// Writes the placeholder 3D models (public/models/<kind>/<id>.glb) that follow the asset contract
// (docs/ARCHITECTURE.md, section 8), from faceted primitives in the STYLE.md palette:
//
//   node scripts/make-placeholders.mjs
//
// glTF JSON and buffers are written by hand, so there is no dependency. The output is committed
// and must not drift: tests/unit/placeholders.test.ts checks that this script writes the
// committed bytes. A designer's file replaces a placeholder at the same path (section 8), and
// once the registry marks it `"placeholder": false` this script leaves it alone.
//
// Each part is one node with one mesh, and its material is named after the part. Characters
// pivot their limbs and head at nodes, so the clips are node transform animations with no skin.
// A room's shell is laid out in scene pixels, through its camera, over the room's reference art
// (docs/design/rooms/<room>.svg).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { concat, container, srgbToLinear } from './glb-container.mjs';

// Base tones from docs/design/STYLE.md: the protagonist's table (board 2), the palette's
// accents, city, sky and light, and the pub art's bartender (docs/design/rooms/pub.svg).
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
  // The Act 1 cast, from the palette: the beetroot cop, the crows' stools, the dog, the rat and the mare.
  beetroot: '#C8483B',
  leaf: '#3E5E44',
  cap: '#2E3A52',
  stool: '#2F2D35',
  dog: '#C98A6C',
  'dog-ear': '#6E4038',
  leather: '#2F2D35',
  rat: '#8E879C',
  cardigan: '#8A7FA8',
  mare: '#6E4038',
  mane: '#E3C58A',
  hooves: '#2F2D35',
  sash: '#C8483B',
  // The rooms: STYLE.md's city, sky, light and accents, and the room art's own tones (docs/design/rooms/<room>.svg).
  pavement: '#5E5A62',
  kerb: '#4A464E',
  road: '#2F2D35',
  skyline: '#4A4A5E',
  'far-city': '#6E6A82',
  facade: '#96805F',
  shopfront: '#2F4A36',
  fascia: '#1A2822',
  door: '#1A2822',
  glow: '#E8B566',
  'sign-gold': '#E3C58A',
  chalkboard: '#2A2830',
  brick: '#6E4038',
  wainscot: '#4A3A30',
  boards: '#3A2E26',
  night: '#2E3A52',
  'green-door': '#2F4A36',
  bar: '#8A5A34',
  'bar-top': '#6E4628',
  beam: '#2F2D35',
  backdrop: '#2A2A30',
  screen: '#1E1E24',
  header: '#46607E',
  card: '#3A3C46',
  likes: '#C8483B',
  play: '#8A7FA8',
  platform: '#5E5A62',
  rock: '#6E6A82',
  stage: '#5A332D',
  lamp: '#3E5E44',
  banner: '#8E879C',
  haze: '#6E6478',
  clay: '#C98A6C',
};

/** Every placeholder, by its path under public/. */
export function placeholders() {
  return {
    'models/characters/protagonist.glb': glb(protagonist()),
    'models/characters/bartender.glb': glb(bartender()),
    'models/characters/cop.glb': glb(cop()),
    'models/characters/crow.glb': glb(crow()),
    'models/characters/rival.glb': glb(rival()),
    'models/characters/song-master.glb': glb(songMaster()),
    'models/characters/mayor.glb': glb(mayor()),
    'models/objects/flyer.glb': glb(flyer()),
    'models/objects/broken-guitar.glb': glb(brokenGuitar()),
    'models/objects/coach.glb': glb(coach()),
    'models/objects/map-pin.glb': glb(mapPin()),
    'models/scenes/opening.glb': glb(opening()),
    'models/scenes/pub.glb': glb(pub()),
    'models/scenes/feed.glb': glb(feed()),
    'models/scenes/dream.glb': glb(dream()),
    'models/scenes/high-street.glb': glb(highStreet()),
    'models/scenes/music-shop.glb': glb(musicShop()),
    'models/scenes/flat.glb': glb(flat()),
    'models/scenes/mayors-office.glb': glb(mayorsOffice()),
    'models/scenes/coach-station.glb': glb(coachStation()),
    'models/scenes/map.glb': glb(map()),
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

/**
 * One of the Act 1 cast standing on two legs, `hips` metres up, with the contract's anchors and
 * the shared clips. `legs`, `body` and `arms` size its parts; `head` is its head's part, shape and
 * the parts on it; `wearing` goes on the torso and `beside` stands next to it on the floor.
 */
function figure({ name, hips, legs, body, arms, head, wearing = [], beside = [] }) {
  const leg = (side) => ({
    name: `leg_${side}`,
    at: [side === 'l' ? legs.apart : -legs.apart, 0, 0],
    part: legs.part,
    shape: frustum(4, legs.width, legs.width * 0.8, legs.length - 0.03, [0, -legs.length, 0]),
    children: [
      { name: `foot_${side}`, part: legs.foot ?? legs.part, shape: box([-0.05, -legs.length, -0.04], [0.1, 0.04, 0.15]) },
    ],
  });
  const arm = (side) => ({
    name: `arm_${side}`,
    at: [side === 'l' ? body.bottom + 0.02 : -body.bottom - 0.02, arms.at, 0],
    part: arms.part,
    shape: frustum(4, 0.035, 0.045, arms.length, [0, -arms.length, 0]),
    children: [
      { name: `hand_${side}`, part: arms.hand ?? arms.part, shape: box([-0.03, -arms.length - 0.06, -0.03], [0.06, 0.06, 0.06]) },
      ...(side === 'r' ? [{ name: 'anchor_hand_r', at: [0, -arms.length - 0.04, 0.04] }] : []),
    ],
  });
  return {
    name,
    children: [
      ...beside,
      {
        name: 'hips',
        at: [0, hips, 0],
        children: [
          leg('l'),
          leg('r'),
          {
            name: 'torso',
            part: body.part,
            shape: frustum(6, body.bottom, body.top, body.height, [0, -0.04, 0]),
            children: [
              arm('l'),
              arm('r'),
              ...wearing,
              { name: 'anchor_back', at: [0, body.height / 2, -body.bottom] },
              {
                name: 'head',
                at: [0, body.height - 0.04, 0],
                part: head.part,
                shape: head.shape,
                children: [...head.on, { name: 'anchor_head', at: [0, head.top, 0] }],
              },
            ],
          },
        ],
      },
    ],
    clips: clips({ hips: [0, hips, 0], legs: ['leg_l', 'leg_r'], arms: ['arm_l', 'arm_r'] }),
  };
}

/** The beetroot cop, about 1.2 m to his leaves: a beetroot on stalk legs, in a police cap. */
function cop() {
  return figure({
    name: 'cop',
    hips: 0.34,
    legs: { part: 'leaf', width: 0.025, length: 0.34, apart: 0.07, foot: 'cap' },
    body: { part: 'beetroot', bottom: 0.07, top: 0.22, height: 0.4 },
    arms: { part: 'leaf', at: 0.3, length: 0.3 },
    head: {
      part: 'beetroot',
      shape: frustum(6, 0.22, 0.12, 0.2),
      top: 0.42,
      on: [
        { name: 'eyes', part: 'paper', shape: box([-0.09, 0.08, 0.17], [0.18, 0.03, 0.03]) },
        { name: 'cap', part: 'cap', shape: frustum(6, 0.13, 0.14, 0.09, [0, 0.19, 0]) },
        { name: 'brim', part: 'cap', shape: box([-0.1, 0.19, 0.08], [0.2, 0.02, 0.1]) },
        { name: 'badge', part: 'sign-gold', shape: box([-0.025, 0.22, 0.13], [0.05, 0.04, 0.02]) },
        ...[-0.4, 0.1, 0.5].map((tilt, i) => ({
          name: `leaf_${i}`,
          at: [0, 0.27, -0.06],
          part: 'leaf',
          shape: rotateX(frustum(3, 0.04, 0, 0.18), tilt - 0.3),
        })),
      ],
    },
  });
}

/** One of the Three Crows, about 1.15 m to its crest: a crow perched on a bar stool. */
function crow() {
  return figure({
    name: 'crow',
    hips: 0.68,
    beside: [
      { name: 'stool-seat', part: 'ink', shape: frustum(8, 0.17, 0.17, 0.05, [0, 0.6, 0]) },
      { name: 'stool-leg', part: 'stool', shape: frustum(4, 0.03, 0.03, 0.6) },
      { name: 'stool-foot', part: 'stool', shape: frustum(6, 0.14, 0.14, 0.03) },
    ],
    legs: { part: 'beak', width: 0.02, length: 0.1, apart: 0.06 },
    body: { part: 'feathers', bottom: 0.15, top: 0.1, height: 0.3 },
    arms: { part: 'feathers', at: 0.25, length: 0.24 },
    head: {
      part: 'feathers',
      shape: frustum(5, 0.1, 0.08, 0.17),
      top: 0.3,
      on: [
        { name: 'beak', at: [0, 0.08, 0.06], part: 'beak', shape: rotateX(frustum(4, 0.04, 0, 0.15), Math.PI / 2) },
        { name: 'eyes', part: 'eyes', shape: box([-0.07, 0.11, 0.05], [0.14, 0.025, 0.03]) },
        { name: 'crest', at: [0, 0.17, -0.02], part: 'feathers', shape: rotateX(frustum(3, 0.04, 0, 0.12), -0.4) },
      ],
    },
  });
}

/** The dog, the rival, about 1.6 m: a lean singer in a leather jacket, ears flopping. */
function rival() {
  return figure({
    name: 'rival',
    hips: 0.74,
    legs: { part: 'jeans', width: 0.06, length: 0.74, apart: 0.08, foot: 'leather' },
    body: { part: 'leather', bottom: 0.17, top: 0.15, height: 0.5 },
    arms: { part: 'leather', at: 0.42, length: 0.48, hand: 'dog' },
    wearing: [{ name: 'shirt', part: 'paper', shape: box([-0.05, 0.1, 0.13], [0.1, 0.34, 0.03]) }],
    head: {
      part: 'dog',
      shape: frustum(5, 0.11, 0.09, 0.22),
      top: 0.34,
      on: [
        { name: 'snout', part: 'dog', shape: box([-0.05, 0.03, 0.06], [0.1, 0.08, 0.16]) },
        { name: 'nose', part: 'feathers', shape: box([-0.025, 0.08, 0.21], [0.05, 0.03, 0.02]) },
        { name: 'eyes', part: 'eyes', shape: box([-0.08, 0.13, 0.08], [0.16, 0.025, 0.02]) },
        ...['l', 'r'].map((side) => ({
          name: `ear_${side}`,
          at: [side === 'l' ? 0.11 : -0.11, 0.2, 0],
          part: 'dog-ear',
          shape: rotateZ(frustum(3, 0.05, 0.02, 0.2, [0, -0.2, 0]), side === 'l' ? 0.3 : -0.3, [0, 0, 0]),
        })),
      ],
    },
  });
}

/** The Song Master, about 1.2 m: an old rat in a cardigan, with round ears and a long tail. */
function songMaster() {
  return figure({
    name: 'song-master',
    hips: 0.46,
    beside: [{ name: 'tail', at: [0, 0.48, -0.12], part: 'rat', shape: rotateX(frustum(4, 0.025, 0.008, 0.5), -2.4) }],
    legs: { part: 'rat', width: 0.04, length: 0.46, apart: 0.07 },
    body: { part: 'cardigan', bottom: 0.16, top: 0.11, height: 0.4 },
    arms: { part: 'cardigan', at: 0.34, length: 0.36, hand: 'rat' },
    head: {
      part: 'rat',
      shape: frustum(5, 0.1, 0.07, 0.16),
      top: 0.32,
      on: [
        { name: 'snout', at: [0, 0.07, 0.06], part: 'rat', shape: rotateX(frustum(4, 0.06, 0, 0.18), Math.PI / 2) },
        { name: 'nose', part: 'clay', shape: box([-0.015, 0.06, 0.23], [0.03, 0.03, 0.02]) },
        { name: 'eyes', part: 'feathers', shape: box([-0.06, 0.1, 0.07], [0.12, 0.02, 0.02]) },
        ...['l', 'r'].map((side) => ({
          name: `ear_${side}`,
          at: [side === 'l' ? 0.09 : -0.09, 0.16, 0],
          part: 'clay',
          shape: rotateX(frustum(6, 0.06, 0.05, 0.02), Math.PI / 2),
        })),
      ],
    },
  });
}

/** The Mayor, about 1.8 m: a mare in a red sash, with a long golden mane. */
function mayor() {
  return figure({
    name: 'mayor',
    hips: 0.84,
    legs: { part: 'mare', width: 0.06, length: 0.84, apart: 0.09, foot: 'hooves' },
    body: { part: 'mare', bottom: 0.2, top: 0.16, height: 0.56 },
    arms: { part: 'mare', at: 0.48, length: 0.52, hand: 'hooves' },
    wearing: [{ name: 'sash', part: 'sash', shape: rotateZ(box([-0.22, -0.03, -0.2], [0.44, 0.06, 0.42]), 0.7, [0, 0.3, 0]) }],
    head: {
      part: 'mare',
      shape: frustum(5, 0.1, 0.08, 0.28),
      top: 0.42,
      on: [
        { name: 'muzzle', part: 'mare', shape: rotateX(box([-0.07, -0.02, 0], [0.14, 0.12, 0.26]), -0.5) },
        { name: 'eyes', part: 'eyes', shape: box([-0.09, 0.2, 0.06], [0.18, 0.025, 0.02]) },
        ...['l', 'r'].map((side) => ({
          name: `ear_${side}`,
          at: [side === 'l' ? 0.06 : -0.06, 0.27, 0],
          part: 'mare',
          shape: frustum(3, 0.04, 0, 0.12),
        })),
        { name: 'mane', part: 'mane', shape: box([-0.12, -0.4, -0.15], [0.24, 0.76, 0.1]) },
      ],
    },
  });
}

/** A flyer: a flat card standing on its bottom edge. */
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

/** A coach seen side-on, 5 m long and 3 m high: a blue body over its wheels, a band of lit windows, the door at the front. */
function coach() {
  return {
    name: 'coach',
    part: 'header',
    shape: box([-2.5, 0.4, -0.8], [5, 2.6, 1.6]),
    children: [
      { name: 'windows', part: 'glow', shape: box([-2.25, 1.7, 0.8], [4, 0.9, 0.02]) },
      { name: 'coach-door', part: 'fascia', shape: box([1.75, 0.45, 0.8], [0.55, 2.2, 0.03]) },
      { name: 'stripe', part: 'sign-gold', shape: box([-2.5, 1.2, 0.8], [4.2, 0.12, 0.02]) },
      ...[-1.6, 1.4].flatMap((x, i) =>
        [0.65, -0.85].map((z, j) => ({ name: `wheel_${i}_${j}`, part: 'road', shape: box([x - 0.4, 0, z], [0.8, 0.75, 0.2]) })),
      ),
    ],
  };
}

/** A pin for a place on the map, a little under 1 m tall: a red head on a dark stem. */
function mapPin() {
  return {
    name: 'map-pin',
    part: 'beam',
    shape: frustum(4, 0.02, 0.03, 0.65),
    children: [{ name: 'pin-head', part: 'sash', shape: frustum(6, 0.14, 0.14, 0.24, [0, 0.65, 0]) }],
  };
}

// --- The rooms. Each one is laid out in the scene pixels of its reference art (1280 x 640), through
// its camera: the walkable area's front centre (content/rooms/<room>.json) is the origin, and
// a wall or prop stands on the plane where its foot meets the floor. ---------------------------

/** The camera of every room: 25° high, 2.5 m up and tipped 6° down, so the protagonist is about 256 px tall at the front. */
const YFOV = (25 * Math.PI) / 180;
const EYE = 2.5;
const TILT = (-6 * Math.PI) / 180;
const [SCENE_WIDTH, SCENE_HEIGHT] = [1280, 640];
/** How far the floor reaches past the front of the walk line, inside the contract's tolerance. */
const FRONT = 0.015;

/**
 * A room's camera, placed so that `front`, the front centre of its walkable area in scene pixels,
 * is the origin; and the room's pixels as world points through it.
 */
function lens(front) {
  const tan = Math.tan(YFOV / 2);
  const direction = (x, y) => {
    const [dx, dy, dz] = [((2 * x) / SCENE_WIDTH - 1) * tan * (SCENE_WIDTH / SCENE_HEIGHT), (1 - (2 * y) / SCENE_HEIGHT) * tan, -1];
    return [dx, dy * Math.cos(TILT) - dz * Math.sin(TILT), dy * Math.sin(TILT) + dz * Math.cos(TILT)];
  };
  const toFront = direction(front.x, front.y);
  const reach = EYE / -toFront[1];
  const eye = [-reach * toFront[0], EYE, -reach * toFront[2]].map(round);
  const along = (x, y, t) => eye.map((v, axis) => v + t * direction(x, y)[axis]);
  return {
    camera: { name: 'cam_main', at: eye, rotation: [Math.sin(TILT / 2), 0, 0, Math.cos(TILT / 2)].map(round), yfov: YFOV },
    /** The floor under a pixel. */
    floor: (x, y) => along(x, y, EYE / -direction(x, y)[1]),
    /** The point of the upright plane at depth `z` under a pixel. */
    at: (x, y, z) => along(x, y, (z - eye[2]) / direction(x, y)[2]),
  };
}

/** A room's parts on its camera: boxes over pixel rects, standing on the floor or on a plane. */
function shell(front) {
  const view = lens(front);
  /** A box whose front face covers `rect` in the scene at depth `z`, `depth` deep. */
  const panel = ({ x, y, width, height }, z, depth) => {
    const [left, top] = view.at(x, y, z);
    const [right, bottom] = view.at(x + width, y + height, z);
    return box([left, bottom, z - depth], [right - left, top - bottom, depth]);
  };
  /** The depth at which a pixel row meets the floor. */
  const depthAt = (y) => view.floor(front.x, y)[2];
  return {
    camera: view.camera,
    point: view.at,
    depthAt,
    panel,
    /** A box over `rect` that stands on the floor where its foot, the rect's bottom, meets it. */
    standing: (rect, depth) => panel(rect, depthAt(rect.y + rect.height), depth),
    /** The floor across the scene from the depth of pixel row `back` to just past the origin, and a strip of `apron` in front. */
    floor: (back, part, apron) => {
      const z = depthAt(back);
      const [left] = view.at(-40, back, z);
      const [right] = view.at(SCENE_WIDTH + 40, back, z);
      return [
        { name: 'floor', part, shape: ground([left, z], [right, FRONT]) },
        { name: 'apron', part: apron, shape: ground([left, FRONT], [right, 2]) },
      ];
    },
  };
}

/** A flat quad on the floor (y = 0) from the back left corner to the front right one, facing up. */
function ground([x0, z0], [x1, z1]) {
  const [a, b, c, d] = [[x0, 0, z0], [x0, 0, z1], [x1, 0, z1], [x1, 0, z0]];
  return [[a, b, c], [a, c, d]];
}

const rect = (x, y, width, height) => ({ x, y, width, height });

/**
 * The street outside The Three Crows: its green shopfront and lit windows, the board on the
 * pavement, the city down the side street and the sign down the High Street.
 */
function opening() {
  const room = shell({ x: 820, y: 610 });
  const wall = room.depthAt(518);
  const far = wall - 14;
  const [corner] = room.point(300, 518, wall);
  const windows = [rect(506, 253, 99, 217), rect(806, 253, 148, 217), rect(995, 253, 147, 217), rect(1187, 253, 100, 217)];
  return {
    name: 'opening',
    children: [
      ...room.floor(518, 'pavement', 'road'),
      { name: 'side-street', part: 'road', shape: ground([corner - 30, far], [corner, wall]) },
      { name: 'facade', part: 'facade', shape: room.panel(rect(300, -400, 1100, 535), wall, 1) },
      { name: 'shopfront', part: 'shopfront', shape: room.panel(rect(300, 134, 1100, 384), wall + 0.05, 0.05) },
      { name: 'fascia', part: 'fascia', shape: room.panel(rect(470, 140, 830, 46), wall + 0.08, 0.03) },
      ...windows.map((at, i) => ({ name: `window_${i}`, part: 'glow', shape: room.panel(at, wall + 0.07, 0.02) })),
      ...[rect(512, -40, 96, 110), rect(690, -40, 96, 110), rect(868, -40, 96, 110), rect(1046, -40, 96, 110)].map((at, i) => ({
        name: `upstairs_${i}`,
        part: 'glow',
        shape: room.panel(at, wall + 0.02, 0.02),
      })),
      { name: 'side-building', part: 'skyline', shape: room.panel(rect(-40, -100, 230, 610), wall - 3, 3) },
      ...[rect(130, 60, 70, 300), rect(190, 120, 60, 260), rect(240, 30, 50, 330)].map((at, i) => ({
        name: `city_${i}`,
        part: 'far-city',
        shape: room.panel(at, far, 2),
      })),
      { name: 'hit_door', part: 'door', shape: room.panel(rect(634, 208, 142, 312), wall + 0.1, 0.05) },
      signpost(room, 'street', rect(414, 384, 56, 160), 'sign-gold'),
      {
        name: 'hit_board',
        part: 'chalkboard',
        shape: room.standing(rect(874, 454, 92, 118), 0.08),
        children: [{ name: 'board-headline', part: 'sign-gold', shape: room.panel(rect(886, 470, 68, 14), room.depthAt(572) + 0.01, 0.01) }],
      },
      room.camera,
    ],
  };
}

/** Inside The Three Crows: the brick wall with its window and Wall of Fame, the stage under them, the street door, and the bar. */
function pub() {
  const room = shell({ x: 640, y: 615 });
  const wall = room.depthAt(470);
  /** The stage is a low riser from the wall to just behind the floor's back edge. */
  const stageFront = room.depthAt(522);
  return {
    name: 'pub',
    children: [
      ...room.floor(470, 'boards', 'boards'),
      { name: 'wall', part: 'brick', shape: room.panel(rect(-40, -400, 1360, 870), wall, 0.2) },
      { name: 'wainscot', part: 'wainscot', shape: room.panel(rect(-40, 384, 1360, 86), wall + 0.03, 0.03) },
      { name: 'beam', part: 'beam', shape: room.panel(rect(-40, -60, 1360, 100), wall + 0.08, 0.08) },
      { name: 'window', part: 'night', shape: room.panel(rect(330, 115, 124, 157), wall + 0.02, 0.02) },
      {
        name: 'hit_fame',
        part: 'wainscot',
        shape: room.panel(rect(496, 160, 200, 180), wall + 0.02, 0.02),
        children: [rect(508, 172, 82, 70), rect(602, 172, 82, 70), rect(508, 256, 82, 70), rect(602, 256, 82, 70)].map((at, i) => ({
          name: `photo_${i}`,
          part: 'paper',
          shape: room.panel(at, wall + 0.04, 0.02),
        })),
      },
      { name: 'hit_stage', part: 'bar-top', shape: room.panel(rect(230, 474, 480, 48), stageFront, stageFront - wall) },
      { name: 'sign', part: 'fascia', shape: room.panel(rect(858, 61, 332, 64), wall + 0.04, 0.04) },
      ...[182, 272].map((y, i) => ({ name: `shelf_${i}`, part: 'bar', shape: room.panel(rect(800, y, 461, 10), wall + 0.25, 0.25) })),
      { name: 'bar', part: 'bar', shape: room.panel(rect(733, 362, 560, 108), wall + 0.7, 0.7) },
      { name: 'bar-top', part: 'bar-top', shape: room.panel(rect(726, 352, 570, 12), wall + 0.75, 0.8) },
      { name: 'hit_door', part: 'green-door', shape: room.panel(rect(60, 138, 162, 332), wall + 0.06, 0.06) },
      room.camera,
    ],
  };
}

/** The band's page, as a room: the empty page on its screen, the cards around it and the likes. */
function feed() {
  const room = shell({ x: 640, y: 606 });
  const wall = room.depthAt(522);
  const cards = [rect(430, 237, 200, 118), rect(650, 237, 200, 118), rect(430, 372, 200, 109), rect(650, 372, 200, 109)];
  const sides = [rect(60, 80, 150, 189), rect(60, 301, 150, 189), rect(1070, 80, 150, 189), rect(1070, 301, 150, 189)];
  return {
    name: 'feed',
    children: [
      ...room.floor(522, 'road', 'road'),
      { name: 'backdrop', part: 'backdrop', shape: room.panel(rect(-40, -400, 1360, 922), wall, 0.2) },
      ...sides.map((at, i) => ({ name: `post_${i}`, part: 'card', shape: room.panel(at, wall + 0.02, 0.02) })),
      {
        name: 'hit_page',
        part: 'screen',
        shape: room.panel(rect(381, 19, 518, 499), wall + 0.1, 0.1),
        children: [
          { name: 'header', part: 'header', shape: room.panel(rect(400, 40, 480, 120), wall + 0.12, 0.02) },
          ...cards.map((at, i) => ({ name: `slot_${i}`, part: 'card', shape: room.panel(at, wall + 0.12, 0.02) })),
        ],
      },
      { name: 'play', part: 'play', shape: room.standing(rect(221, 460, 59, 60), 0.3) },
      { name: 'hit_likes', part: 'likes', shape: room.standing(rect(960, 432, 80, 88), 0.4) },
      room.camera,
    ],
  };
}

/** The dream: a stone platform in the dusk, the stage floating over it, banners hanging from nowhere. */
function dream() {
  const room = shell({ x: 660, y: 620 });
  const back = room.depthAt(525);
  const stage = back - 6;
  const sky = back - 60;
  const banners = [rect(80, -40, 80, 130), rect(200, -40, 36, 88), rect(300, -40, 60, 160), rect(880, -40, 80, 124), rect(1010, -40, 50, 152), rect(1120, -40, 60, 136)];
  return {
    name: 'dream',
    children: [
      ...room.floor(525, 'platform', 'platform'),
      { name: 'underside', part: 'rock', shape: box([-12, -0.6, back], [24, 0.6, 2 - back]) },
      { name: 'haze', part: 'haze', shape: room.panel(rect(-40, 200, 1360, 240), sky, 1) },
      { name: 'horizon', part: 'clay', shape: room.panel(rect(-40, 440, 1360, 240), sky, 1) },
      ...banners.map((at, i) => ({ name: `banner_${i}`, part: 'banner', shape: room.panel(at, stage - 4, 0.1) })),
      {
        name: 'hit_stage',
        part: 'stage',
        shape: room.panel(rect(618, 298, 404, 64), stage, 3),
        children: [
          { name: 'stage-rock', part: 'rock', shape: room.panel(rect(560, 362, 518, 70), stage + 0.2, 3.4) },
          { name: 'mic', part: 'beam', shape: room.panel(rect(806, 228, 6, 70), stage - 1.5, 0.05) },
          ...[688, 950].map((x, i) => ({ name: `lamp_${i}`, part: 'lamp', shape: room.panel(rect(x - 36, 150, 72, 26), stage - 1, 0.6) })),
        ],
      },
      room.camera,
    ],
  };
}

/** The hotspot `hit_<id>`: a street's wayfinding sign standing on the pavement over `at`, its name band in `band`. */
function signpost(room, id, at, band) {
  const front = room.depthAt(at.y + at.height) + 0.01;
  return {
    name: `hit_${id}`,
    part: 'fascia',
    shape: room.standing(at, 0.1),
    children: [{ name: `${id}-sign`, part: band, shape: room.panel(rect(at.x + 6, at.y + 12, at.width - 12, 26), front, 0.01) }],
  };
}

/** Further down the High Street: the music shop, the Song Master's door and intercom, the way back and the way to the Mayor's. */
function highStreet() {
  const room = shell({ x: 640, y: 610 });
  const wall = room.depthAt(518);
  return {
    name: 'high-street',
    children: [
      ...room.floor(518, 'pavement', 'road'),
      { name: 'skyline', part: 'far-city', shape: room.panel(rect(-40, -100, 1360, 300), wall - 12, 2) },
      { name: 'shop-facade', part: 'facade', shape: room.panel(rect(150, -60, 470, 578), wall, 1) },
      { name: 'shopfront', part: 'shopfront', shape: room.panel(rect(170, 180, 430, 338), wall + 0.05, 0.05) },
      { name: 'shop-fascia', part: 'fascia', shape: room.panel(rect(180, 190, 410, 44), wall + 0.08, 0.03) },
      { name: 'shop-window', part: 'glow', shape: room.panel(rect(196, 262, 200, 200), wall + 0.07, 0.02) },
      { name: 'hit_shop', part: 'door', shape: room.panel(rect(440, 262, 120, 256), wall + 0.1, 0.05) },
      { name: 'flat-facade', part: 'brick', shape: room.panel(rect(620, -60, 420, 578), wall, 1) },
      ...[rect(660, 40, 90, 120), rect(860, 40, 90, 120)].map((at, i) => ({
        name: `flat-window_${i}`,
        part: 'glow',
        shape: room.panel(at, wall + 0.02, 0.02),
      })),
      { name: 'hit_flat-door', part: 'green-door', shape: room.panel(rect(700, 290, 112, 228), wall + 0.06, 0.06) },
      { name: 'hit_intercom', part: 'sign-gold', shape: room.panel(rect(838, 380, 30, 46), wall + 0.05, 0.04) },
      { name: 'far-facade', part: 'skyline', shape: room.panel(rect(1040, -60, 300, 578), wall - 1.5, 1) },
      signpost(room, 'back', rect(112, 380, 56, 160), 'sign-gold'),
      signpost(room, 'mayor', rect(1112, 380, 56, 160), 'sash'),
      room.camera,
    ],
  };
}

/** Inside the music shop: guitars on the wall, the counter and its rack of strings, the door out. */
function musicShop() {
  const room = shell({ x: 640, y: 615 });
  const wall = room.depthAt(480);
  return {
    name: 'music-shop',
    children: [
      ...room.floor(480, 'boards', 'boards'),
      { name: 'wall', part: 'night', shape: room.panel(rect(-40, -400, 1360, 880), wall, 0.2) },
      { name: 'wainscot', part: 'wainscot', shape: room.panel(rect(-40, 400, 1360, 80), wall + 0.03, 0.03) },
      ...[300, 420, 540, 1020, 1140].map((x, i) => ({
        name: `guitar_${i}`,
        part: 'guitar',
        shape: room.panel(rect(x, 150, 70, 180), wall + 0.05, 0.05),
      })),
      { name: 'counter', part: 'bar', shape: room.panel(rect(680, 380, 320, 100), wall + 0.6, 0.6) },
      { name: 'counter-top', part: 'bar-top', shape: room.panel(rect(672, 370, 336, 12), wall + 0.65, 0.7) },
      { name: 'hit_strings', part: 'paper', shape: room.panel(rect(760, 170, 160, 100), wall + 0.04, 0.04) },
      { name: 'hit_door', part: 'green-door', shape: room.panel(rect(60, 150, 160, 330), wall + 0.06, 0.06) },
      room.camera,
    ],
  };
}

/** The Song Master's flat: a small room with a window over the street, a chair and an old upright piano, the door down. */
function flat() {
  const room = shell({ x: 640, y: 615 });
  const wall = room.depthAt(480);
  return {
    name: 'flat',
    children: [
      ...room.floor(480, 'boards', 'boards'),
      { name: 'wall', part: 'haze', shape: room.panel(rect(-40, -400, 1360, 880), wall, 0.2) },
      { name: 'wainscot', part: 'wainscot', shape: room.panel(rect(-40, 400, 1360, 80), wall + 0.03, 0.03) },
      { name: 'window', part: 'night', shape: room.panel(rect(480, 110, 180, 200), wall + 0.02, 0.02) },
      { name: 'piano', part: 'bar-top', shape: room.panel(rect(900, 300, 260, 180), wall + 0.5, 0.5) },
      { name: 'keys', part: 'paper', shape: room.panel(rect(910, 380, 240, 14), wall + 0.55, 0.1) },
      { name: 'chair', part: 'bar', shape: room.standing(rect(640, 420, 90, 110), 0.4) },
      { name: 'hit_door', part: 'green-door', shape: room.panel(rect(60, 150, 160, 330), wall + 0.06, 0.06) },
      room.camera,
    ],
  };
}

/** The Mayor's office: panelled walls, her portrait, a desk and a flag, the door out. */
function mayorsOffice() {
  const room = shell({ x: 640, y: 615 });
  const wall = room.depthAt(480);
  return {
    name: 'mayors-office',
    children: [
      ...room.floor(480, 'boards', 'boards'),
      { name: 'wall', part: 'facade', shape: room.panel(rect(-40, -400, 1360, 880), wall, 0.2) },
      { name: 'wainscot', part: 'wainscot', shape: room.panel(rect(-40, 360, 1360, 120), wall + 0.03, 0.03) },
      { name: 'portrait', part: 'sign-gold', shape: room.panel(rect(560, 90, 160, 200), wall + 0.03, 0.03) },
      { name: 'portrait-mane', part: 'mane', shape: room.panel(rect(590, 120, 100, 150), wall + 0.05, 0.02) },
      { name: 'flag', part: 'sash', shape: room.panel(rect(1000, 120, 90, 140), wall + 0.3, 0.02) },
      { name: 'flagpole', part: 'beam', shape: room.panel(rect(1090, 100, 8, 380), wall + 0.3, 0.04) },
      { name: 'desk', part: 'bar', shape: room.panel(rect(420, 380, 440, 100), wall + 0.8, 0.8) },
      { name: 'hit_door', part: 'green-door', shape: room.panel(rect(60, 150, 160, 330), wall + 0.06, 0.06) },
      room.camera,
    ],
  };
}

/** The coach station: the bays and the departures board under the canopy, the map stand by the exit, the way up the road. */
function coachStation() {
  const room = shell({ x: 640, y: 612 });
  const wall = room.depthAt(500);
  return {
    name: 'coach-station',
    children: [
      ...room.floor(500, 'pavement', 'road'),
      { name: 'hall', part: 'skyline', shape: room.panel(rect(-40, -400, 1360, 900), wall, 1) },
      { name: 'canopy', part: 'beam', shape: room.panel(rect(-40, 40, 1360, 50), wall + 0.12, 0.12) },
      ...[60, 250, 440].map((x, i) => ({ name: `bay_${i}`, part: 'kerb', shape: room.panel(rect(x, 90, 16, 410), wall + 0.2, 0.1) })),
      ...[80, 270].map((x, i) => ({ name: `bay-sign_${i}`, part: 'sign-gold', shape: room.panel(rect(x + 50, 110, 60, 30), wall + 0.1, 0.02) })),
      { name: 'exit', part: 'glow', shape: room.panel(rect(1060, 180, 200, 320), wall + 0.02, 0.02) },
      {
        name: 'hit_board',
        part: 'screen',
        shape: room.panel(rect(540, 190, 220, 120), wall + 0.06, 0.06),
        children: [0, 1, 2].map((i) => ({
          name: `departure_${i}`,
          part: 'sign-gold',
          shape: room.panel(rect(556, 210 + i * 32, 188, 12), wall + 0.07, 0.01),
        })),
      },
      {
        name: 'hit_map-stand',
        part: 'card',
        shape: room.standing(rect(880, 430, 64, 120), 0.3),
        children: [440, 480].map((y, i) => ({
          name: `free-map_${i}`,
          part: 'paper',
          shape: room.panel(rect(890, y, 44, 28), room.depthAt(550) + 0.01, 0.01),
        })),
      },
      signpost(room, 'road', rect(1150, 384, 56, 160), 'sign-gold'),
      room.camera,
    ],
  };
}

/** The map: Punland from above, spread on the floor, its streets, the blank streets at the back still to find, and the tab that closes it. */
function map() {
  const room = shell({ x: 640, y: 615 });
  /** A strip `lift` above the map, from pixel column `x0` to `x1` where it meets row `y1`, back from there to row `y0`. */
  const strip = (x0, x1, y0, y1, lift) => {
    const [near, far] = [room.depthAt(y1), room.depthAt(y0)];
    const [left] = room.point(x0, y1, near);
    const [right] = room.point(x1, y1, near);
    return box([left, 0, far], [right - left, lift, near - far]);
  };
  return {
    name: 'map',
    children: [
      ...room.floor(400, 'paper', 'paper'),
      { name: 'table', part: 'night', shape: room.panel(rect(-40, -400, 1360, 800), room.depthAt(400), 1) },
      ...[
        [80, 1200, 520, 530],
        [60, 1220, 575, 585],
        [410, 430, 470, 615],
        [750, 770, 470, 615],
      ].map(([x0, x1, y0, y1], i) => ({ name: `street_${i}`, part: 'road', shape: strip(x0, x1, y0, y1, 0.004) })),
      { name: 'hit_streets', part: 'haze', shape: strip(80, 1200, 400, 470, 0.02) },
      signpost(room, 'close', rect(1190, 410, 56, 160), 'sash'),
      room.camera,
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
  const cameras = [];
  const add = (part) => {
    const node = { name: part.name };
    nodes.push(node);
    if (part.at) node.translation = part.at;
    if (part.rotation) node.rotation = part.rotation;
    if (part.yfov) {
      cameras.push({ type: 'perspective', perspective: { aspectRatio: 2, yfov: round(part.yfov), znear: 0.1, zfar: 200 } });
      node.camera = cameras.length - 1;
    }
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
    ...(cameras.length && { cameras }),
    ...(animations.length && { animations }),
    accessors,
    bufferViews,
    buffers: [{ byteLength: bin.byteLength }],
  };
  return container(gltf, bin);
}

/** To 0.1 mm, so the files don't hang on the last bits of floating point. */
function round(value) {
  return Math.round(value * 1e4) / 1e4 + 0;
}

// The placeholders to write, leaving out any file the registry marks a designer's (`placeholder: false`).
export function placeholdersToWrite(models) {
  const replaced = new Set(models.flatMap(({ model3d }) => (model3d?.placeholder === false ? [model3d.file] : [])));
  return Object.fromEntries(Object.entries(placeholders()).filter(([path]) => !replaced.has(path)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const frontend = join(dirname(fileURLToPath(import.meta.url)), '..');
  const publicDir = join(frontend, 'public');
  const { models } = JSON.parse(readFileSync(join(frontend, 'src', 'assets', 'models.json'), 'utf8'));
  for (const [path, bytes] of Object.entries(placeholdersToWrite(models))) {
    mkdirSync(dirname(join(publicDir, path)), { recursive: true });
    writeFileSync(join(publicDir, path), bytes);
    console.log(`public/${path}  ${bytes.byteLength} bytes`);
  }
}
