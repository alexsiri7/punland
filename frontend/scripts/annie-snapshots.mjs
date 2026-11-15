// Screenshots every room of a deployed build that has an Annie location, and posts each with its
// hotspots to Annie's snapshot ingest, so Annie sees what is live (#130):
//
//   BUILD=<sha> ANNIE_URL=... ANNIE_API_TOKEN=... ANNIE_PROJECT_ID=... node scripts/annie-snapshots.mjs <site url>
//
// .github/workflows/annie-snapshots.yml runs it after each deploy of main. scripts/annie-locations.json
// maps a room id to its Annie location slug, the `story/annie/location/<slug>.md` file name of the
// location it depicts; a room without one is skipped with a warning.
//
// There is no capture mode: the script plays the public build as a player's browser could. It seeds
// a save in the room, aborts every request that leaves the site (so nothing reaches the backend),
// clicks Continue and waits for the room at rest: drawn (#game[data-scene]), past its cutscene
// (data-cue) and silent (data-say). The things are the hotspot buttons over the canvas, named by
// their data-hotspot.
import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WIDTH = 1280;
const HEIGHT = 800;
// SAVE_KEY in src/services/save.ts.
const SAVE_KEY = 'punland.save.v1';

/**
 * Annie's `things` for a room's hotspots that have a box on screen, in room order: the key is the
 * hotspot's id, the description what the player sees on looking at it.
 */
export function snapshotThings(room, entities, boxes, protagonist) {
  const named = (text) => text.replaceAll('{protagonist}', protagonist);
  return room.hotspots.flatMap((h) => {
    const box = boxes.get(h.id);
    if (!box) return [];
    const look = h.interactions.find((i) => i.verb === 'look' && i.item === undefined);
    const lines = (look?.effects ?? []).flatMap((e) => (typeof e.say === 'string' && e.by === undefined ? [e.say] : []));
    return [{ key: h.id, name: named(h.name), description: named(lines.join(' ')), kind: kindOf(h.target, entities), box }];
  });
}

function kindOf(target, { characters, objects }) {
  if (!('entity' in target)) return 'scene';
  if (characters.has(target.entity)) return 'character';
  if (objects.has(target.entity)) return 'object';
  throw new Error(`entity "${target.entity}" is neither a character nor an object`);
}

async function capture(browser, site, room) {
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    const origin = new URL(site).origin;
    await page.route('**/*', (route) =>
      new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
    );
    const save = { version: 1, room, savedAt: new Date().toISOString(), visited: [room] };
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [SAVE_KEY, JSON.stringify(save)]);
    await page.goto(site);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.locator(`#game[data-scene="${room}"][data-cue="off"][data-say=""]`).waitFor({ timeout: 90_000 });
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const canvas = await page.locator('#game canvas').boundingBox();
    if (!canvas) throw new Error('the game has no canvas');
    const png = await page.screenshot({ clip: canvas, type: 'png' });
    const buttons = await page
      .locator('#game .hotspots button[data-hotspot]')
      .evaluateAll((all) => all.map((b) => ({ id: b.dataset.hotspot, rect: b.getBoundingClientRect().toJSON() })));
    const boxes = new Map(
      buttons.map(({ id, rect }) => [
        id,
        {
          x: Math.round(rect.x - canvas.x),
          y: Math.round(rect.y - canvas.y),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        },
      ]),
    );
    return { png, boxes };
  } finally {
    await context.close();
  }
}

async function post({ url, token, project, build }, room, slug, png, things) {
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), `${room}.png`);
  form.append('build', build);
  form.append('takenAt', new Date().toISOString());
  form.append('things', JSON.stringify(things));
  const response = await fetch(
    `${url}/api/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(slug)}/snapshots`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form },
  );
  const body = await response.text();
  if (response.status === 201) return console.log(`${room} -> ${slug}: new snapshot`);
  if (response.status === 200) return console.log(`${room} -> ${slug}: unchanged`);
  if (response.status === 404) {
    const known = JSON.parse(body).knownSlugs ?? [];
    throw new Error(`Annie has no location "${slug}" (known: ${known.join(', ')})`);
  }
  throw new Error(`Annie answered ${response.status}: ${body}`);
}

async function main() {
  const site = process.argv[2];
  const annie = {
    url: process.env.ANNIE_URL,
    token: process.env.ANNIE_API_TOKEN,
    project: process.env.ANNIE_PROJECT_ID,
    build: process.env.BUILD,
  };
  if (!site || Object.values(annie).some((value) => !value)) {
    throw new Error('usage: BUILD ANNIE_URL ANNIE_API_TOKEN ANNIE_PROJECT_ID node scripts/annie-snapshots.mjs <site url>');
  }
  const frontend = join(dirname(fileURLToPath(import.meta.url)), '..');
  const content = join(frontend, 'src', 'content');
  const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
  const locations = read(join(frontend, 'scripts', 'annie-locations.json'));
  const rooms = Object.fromEntries(
    readdirSync(join(content, 'rooms')).map((file) => [basename(file, '.json'), read(join(content, 'rooms', file))]),
  );
  const ids = (file, key) => new Set(read(join(content, file))[key].map(({ id }) => id));
  const entities = { characters: ids('characters.json', 'characters'), objects: ids('objects.json', 'objects') };
  const { PROTAGONIST } = await import('../src/content/protagonist.ts');

  for (const id of Object.keys(rooms)) {
    if (!locations[id]) console.log(`::warning::Room "${id}" has no Annie location in scripts/annie-locations.json: skipped`);
  }
  for (const id of Object.keys(locations)) {
    if (!rooms[id]) console.log(`::warning::scripts/annie-locations.json maps "${id}", which is not a room: skipped`);
  }

  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  const failed = [];
  try {
    for (const [room, slug] of Object.entries(locations)) {
      if (!rooms[room]) continue;
      try {
        const { png, boxes } = await capture(browser, site, room);
        await post(annie, room, slug, png, snapshotThings(rooms[room], entities, boxes, PROTAGONIST.name));
      } catch (error) {
        console.log(`::error::Room "${room}" (Annie location "${slug}"): ${error.message}`);
        failed.push(room);
      }
    }
  } finally {
    await browser.close();
  }
  if (failed.length > 0) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
