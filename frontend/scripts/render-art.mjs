// Renders a room's layered SVG (art/<room>/scene.svg) to the PNG files the game loads
// (public/rooms/<room>/*.png + art.json). Run after editing a scene SVG:
//
//   node scripts/render-art.mjs [room ...]        (default: every folder in art/)
//
// Why PNG: an SVG used as an image cannot load web fonts, so the sign lettering
// (Bebas Neue / Inter, see docs/design/STYLE.md) would fall back to a system font.
// Rendering in headless Chromium with the self-hosted fonts bakes the lettering in.
//
// Output per room (positions are in scene pixels, 1280 x 640):
//   background.jpg  layers sky, far, mid, ground, props + the grain overlay (full frame)
//   <actor>.png     each direct child <g> of layer-actors with an id, cropped; art.json records
//                   the actor's feet as `foot`: by convention the origin of the actor's <g>
//   fore.png        layer-fore, cropped
//   poster.jpg      every layer composited (title screen backdrop; not listed in art.json)
// The actor layer is split out so characters stay swappable sprites (STYLE.md, Scene build).
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCALE = 2; // render at 2x for sharp art on high-DPI screens; art.json records it
const W = 1280;
const H = 640;

// Fonts are inlined as data: URIs: this render page (about:blank) may not read file:// URLs.
const font = (pkg, file) =>
  `data:font/woff2;base64,${readFileSync(join(root, 'node_modules/@fontsource', pkg, 'files', file)).toString('base64')}`;
const fontFaces = `
@font-face{font-family:'Bebas Neue';font-weight:400;src:url(${font('bebas-neue', 'bebas-neue-latin-400-normal.woff2')})}
@font-face{font-family:'Inter';font-weight:400;src:url(${font('inter', 'inter-latin-400-normal.woff2')})}
@font-face{font-family:'Inter';font-weight:500;src:url(${font('inter', 'inter-latin-500-normal.woff2')})}
@font-face{font-family:'Inter';font-weight:600;src:url(${font('inter', 'inter-latin-600-normal.woff2')})}
html,body{margin:0;background:transparent}svg{display:block}`;

// Grain for a cut-out layer: the same noise as the scene's grain rect, clipped to the layer's alpha.
const layerGrain = `<filter id="render-grain" x="0" y="0" width="100%" height="100%" filterUnits="userSpaceOnUse">
<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" result="n"/>
<feColorMatrix in="n" type="matrix" values="0 0 0 0 0.08  0 0 0 0 0.07  0 0 0 0 0.09  0 0 0 0.16 0" result="g"/>
<feComposite in="g" in2="SourceAlpha" operator="in" result="gc"/>
<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="gc"/></feMerge></filter>`;

async function renderRoom(browser, room) {
  const svg = readFileSync(join(root, 'art', room, 'scene.svg'), 'utf8').replace(/^<\?xml[^>]*>/, '');
  const out = join(root, 'public', 'rooms', room);
  mkdirSync(out, { recursive: true });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE });
  await page.setContent(`<!doctype html><html><head><style>${fontFaces}</style></head><body>${svg}</body></html>`);
  await page.evaluate(async () => {
    await Promise.all(
      ['400 20px "Bebas Neue"', '400 20px Inter', '500 20px Inter', '600 20px Inter'].map((f) => document.fonts.load(f)),
    );
    await document.fonts.ready;
  });
  await page.evaluate((grain) => {
    const svgEl = document.querySelector('svg');
    svgEl.querySelector('defs').insertAdjacentHTML('beforeend', grain);
  }, layerGrain);

  const shot = async (file, setup, clip) => {
    await page.evaluate(setup);
    const jpeg = file.endsWith('.jpg'); // the opaque background: JPEG keeps the grain affordable
    await page.screenshot({
      path: join(out, file),
      clip: clip ?? { x: 0, y: 0, width: W, height: H },
      ...(jpeg ? { type: 'jpeg', quality: 86 } : { omitBackground: true }),
    });
  };
  const bbox = (sel) =>
    page.evaluate((s) => {
      const r = document.querySelector(s).getBoundingClientRect();
      const x = Math.max(0, Math.floor(r.left) - 4);
      const y = Math.max(0, Math.floor(r.top) - 4);
      return { x, y, width: Math.min(1280, Math.ceil(r.right) + 4) - x, height: Math.min(640, Math.ceil(r.bottom) + 4) - y };
    }, sel);

  const layers = [];
  // Background: everything except actors and foreground; the scene's own grain rect stays on.
  await shot('background.jpg', () => {
    document.querySelector('#layer-actors').style.display = 'none';
    document.querySelector('#layer-fore').style.display = 'none';
  });
  layers.push({ key: `${room}-background`, file: 'background.jpg', x: 0, y: 0, depth: 0 });

  // Cut-out layers: hide every top-level child except the one being rendered.
  const isolate = (id) =>
    page.evaluate((keep) => {
      for (const el of document.querySelector('svg').children) {
        if (el.tagName === 'defs' || el.tagName === 'style') continue;
        el.style.display = el.id === keep ? '' : 'none';
      }
      document.querySelector(`#${keep}`).setAttribute('filter', 'url(#render-grain)');
    }, id);

  const actorIds = await page.evaluate(() =>
    [...document.querySelectorAll('#layer-actors > g')].map((g, i) => g.id || `actor-${i + 1}`),
  );
  for (const [i, id] of actorIds.entries()) {
    await isolate('layer-actors');
    await page.evaluate((n) => {
      [...document.querySelectorAll('#layer-actors > g')].forEach((g, j) => (g.style.display = j === n ? '' : 'none'));
    }, i);
    const clip = await bbox(`#layer-actors > g:nth-of-type(${i + 1})`);
    const foot = await page.evaluate((n) => {
      const m = document.querySelectorAll('#layer-actors > g')[n].getCTM();
      return { x: Math.round(m.e), y: Math.round(m.f) };
    }, i);
    await shot(`${id}.png`, () => {}, clip);
    layers.push({ key: `${room}-${id}`, file: `${id}.png`, x: clip.x, y: clip.y, depth: 10 + i, actor: id, foot });
  }

  await isolate('layer-fore');
  const foreClip = await bbox('#layer-fore');
  await shot('fore.png', () => {}, foreClip);
  layers.push({ key: `${room}-fore`, file: 'fore.png', x: foreClip.x, y: foreClip.y, depth: 100 });

  // Poster: every layer composited, for the title screen backdrop.
  await shot('poster.jpg', () => {
    for (const el of document.querySelector('svg').querySelectorAll('*')) el.style.display = '';
    for (const id of ['layer-actors', 'layer-fore']) document.getElementById(id).removeAttribute('filter');
  });

  writeFileSync(join(out, 'art.json'), JSON.stringify({ room, width: W, height: H, scale: SCALE, layers }, null, 2) + '\n');
  await page.close();
  console.log(`rendered ${room}: ${layers.map((l) => l.file).join(', ')}`);
}

const rooms = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(join(root, 'art'));
const browser = await chromium.launch();
try {
  for (const room of rooms) await renderRoom(browser, room);
} finally {
  await browser.close();
}
