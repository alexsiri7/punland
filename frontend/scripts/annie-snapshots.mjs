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
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Annie's `things` for the hotspots of the player's room that have a box on screen, in room order:
 * the key is the hotspot's id, the description what the player sees on looking at it in `state`.
 * `allHold` is the rules' condition check (src/rules).
 */
export function snapshotThings(content, allHold, state, boxes, protagonist) {
  const named = (text) => text.replaceAll('{protagonist}', protagonist);
  return content.rooms[state.room].hotspots.flatMap((h) => {
    const box = boxes.get(h.id);
    if (!box) return [];
    const look = h.interactions.find((i) => i.verb === 'look' && i.item === undefined && allHold(state, i.when));
    const lines = (look?.effects ?? []).flatMap((e) => (typeof e.say === 'string' && e.by === undefined ? [e.say] : []));
    return [{ key: h.id, name: named(h.name), description: named(lines.join(' ')), kind: kindOf(h.target, content), box }];
  });
}

function kindOf(target, { characters, objects }) {
  if (!('entity' in target)) return 'scene';
  if (Object.hasOwn(characters, target.entity)) return 'character';
  if (Object.hasOwn(objects, target.entity)) return 'object';
  throw new Error(`entity "${target.entity}" is neither a character nor an object`);
}

/** The game's own modules, loaded through Vite, since Node can't run the TypeScript sources as they are. */
async function loadGame(frontend) {
  const { createServer } = await import('vite');
  const vite = await createServer({
    configFile: false,
    root: frontend,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true, hmr: false, ws: false },
  });
  try {
    const load = (path) => vite.ssrLoadModule(path);
    const [{ loadContent }, { fromSave }, { apply, allHold }, { SAVE_KEY }, theme, { PROTAGONIST }] = await Promise.all([
      load('/src/content/index.ts'),
      load('/src/domain/index.ts'),
      load('/src/rules/index.ts'),
      load('/src/services/save.ts'),
      load('/src/presentation/theme.ts'),
      load('/src/content/protagonist.ts'),
    ]);
    return {
      content: loadContent(),
      fromSave,
      apply,
      allHold,
      saveKey: SAVE_KEY,
      viewport: { width: theme.SCENE_WIDTH, height: theme.SCENE_HEIGHT + theme.UI_BAR_HEIGHT },
      protagonist: PROTAGONIST.name,
    };
  } finally {
    await vite.close();
  }
}

/** A save in the room, for Continue to resume. */
function saveIn(room) {
  return { version: 1, room, savedAt: new Date().toISOString(), visited: [room] };
}

/** The game the save resumes, as the capture shows it: past the room's cutscene. */
function atRest({ content, fromSave, apply }, save) {
  let { state } = apply(content, fromSave(save, content), { type: 'begin' });
  while (state.cue || state.walk) state = apply(content, state, { type: 'tick', dtMs: 1000 }).state;
  return state;
}

async function capture(browser, site, game, save) {
  const { room } = save;
  const context = await browser.newContext({ viewport: game.viewport, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    const origin = new URL(site).origin;
    await page.route('**/*', (route) =>
      new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
    );
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [game.saveKey, JSON.stringify(save)]);
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
  const locations = JSON.parse(readFileSync(join(frontend, 'scripts', 'annie-locations.json'), 'utf8'));
  const game = await loadGame(frontend);
  const { rooms } = game.content;

  for (const id of Object.keys(rooms)) {
    if (!locations[id]) console.log(`::warning::Room "${id}" has no Annie location in scripts/annie-locations.json: skipped`);
  }
  for (const id of Object.keys(locations)) {
    if (!Object.hasOwn(rooms, id)) console.log(`::warning::scripts/annie-locations.json maps "${id}", which is not a room: skipped`);
  }

  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  const failed = [];
  try {
    for (const [room, slug] of Object.entries(locations)) {
      if (!Object.hasOwn(rooms, room)) continue;
      try {
        const save = saveIn(room);
        const { png, boxes } = await capture(browser, site, game, save);
        const things = snapshotThings(game.content, game.allHold, atRest(game, save), boxes, game.protagonist);
        await post(annie, room, slug, png, things);
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
