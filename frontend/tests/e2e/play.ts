import { inflateSync } from 'node:zlib';
import type { Locator, Page, Route } from '@playwright/test';
import type { DialogueTurn, SaveGame } from '../../src/domain';
import { expect, test } from './fixtures';

/**
 * The public interface the acceptance tests for spec change #1 play the game through
 * (CLAUDE.md, "Acceptance tests"). Rooms are drawn on a canvas, so what the canvas
 * shows is mirrored on the #game container, the way `data-scene` already is:
 *
 *   data-scene   the room id that is showing
 *   data-player  "x,y": where the player character stands, in scene pixels (1280 x 640)
 *   data-hover   the name of the hotspot under the pointer, empty when there is none
 *   data-say     the line the cat is saying, empty when silent
 *   data-world   the world that is showing: street, online or dream
 *   data-act     the act being played
 *
 * Hotspots, inventory items, the world switcher, career stats, the act's goals and the
 * conversation panel are DOM with roles and names, so a player with a keyboard or a screen
 * reader can play too.
 *
 * The room attributes (data-scene, data-player, data-hover, data-say) and the Hotspots group
 * are built (#4), the Inventory list (#5), data-world and the Worlds switcher (#9), the
 * conversation dialog (#8), and data-act, the Career stats and the Goals (#11). The issue that
 * builds a piece may settle on a different selector or content name: change it here, in one
 * place, in the PR that removes the test's expected-to-fail marker.
 */

/** Content the tests rely on: the skeleton's opening rooms and Act 1 placeholders (#4, #5, #11). */
export const content = {
  opening: 'opening',
  pubInterior: /pub/,
  pubDoor: /door/i,
  /** The "Tonight: open mic" board on the pavement: a thing to look at in the opening scene. */
  board: /tonight|board/i,
  /** The Open Mic flyer on the pub door: something in the opening scene the cat can pick up. */
  flyer: /flyer/i,
  /**
   * A point on the flyer, in scene pixels, clear of the player when they stand on the pavement:
   * pinned to the pub door in the 2D art, and standing on the pavement in front of it in 3D.
   */
  get flyerSprite(): { x: number; y: number } {
    return isThreeD() ? { x: 737, y: 525 } : { x: 730, y: 410 };
  },
  brokenGuitar: /broken guitar/i,
  /** A character in the pub interior with a conversation goal (getting a job at the pub). */
  bartender: /bartender/i,
  /** The Act 1 goal the bartender conversation reaches. */
  jobGoal: /job/i,
  /**
   * Goal ids of Act 1 and Act 3, in the order the story reaches them; the last one of each
   * is reached by talking to the bartender. Act 1's are #11's placeholder goals; Act 3's are
   * stand-ins until the story has an Act 3.
   */
  act1Goals: ['fix-guitar', 'pub-job', 'late-slot'],
  act3Goals: ['act3-first', 'act3-last'],
  /** A walkable spot on the pavement outside the pub, in scene pixels. */
  pavement: { x: 900, y: 585 },
  /** Where the player stands on coming into the pub, just inside its street door. */
  pubEntrance: { x: 250, y: 585 },
  /** Where the player stands on coming out of the pub, in front of its door. */
  outsidePub: { x: 705, y: 590 },
};

export const game = (page: Page): Locator => page.locator('#game');
export const hotspot = (page: Page, name: string | RegExp): Locator =>
  page.getByRole('group', { name: 'Hotspots' }).getByRole('button', { name });
export const inventory = (page: Page): Locator => page.getByRole('list', { name: 'Inventory' });
export const inventoryItem = (page: Page, name: string | RegExp): Locator =>
  inventory(page).getByRole('button', { name });
export const worlds = (page: Page): Locator => page.getByRole('navigation', { name: 'Worlds' });
export const stats = (page: Page): Locator => page.getByRole('list', { name: 'Career stats' });
/** The current act's goals, each a checkbox that is checked once the goal is reached. */
export const goal = (page: Page, name: string | RegExp): Locator =>
  page.getByRole('list', { name: 'Goals' }).getByRole('checkbox', { name });
export const conversation = (page: Page): Locator => page.getByRole('dialog');

/**
 * The renderers while both exist (docs/ARCHITECTURE.md, "Renderer choice"): `?renderer=2d`
 * draws the room's art layers, `?renderer=3d` its models. Without one, the game's default, 3D.
 */
export type Renderer = '2d' | '3d';

/**
 * The renderer the running Playwright project plays with (playwright.config.ts): the suite runs
 * once in the default renderer, 3D, and once in 2D.
 */
function projectRenderer(): Renderer | undefined {
  return test.info().project.metadata.renderer === '2d' ? '2d' : undefined;
}

/** Whether this run plays in 3D, for tests that need a later 3D step: `test.fail(isThreeD(), 'needs B7')`. */
export const isThreeD = (): boolean => projectRenderer() !== '2d';

/** The opening room's scene model, which the 3D renderer draws it from (models spec). */
export const openingSceneModel = '/models/scenes/opening.glb';

/** The protagonist's model, which the 3D renderer draws the player with in every room. */
const playerModel = '/models/characters/protagonist.glb';

/** The game's page, with the project's renderer unless the test asks for one. */
function gamePage(renderer = projectRenderer()): string {
  return renderer ? `/?renderer=${renderer}` : '/';
}

export async function newGame(page: Page, renderer = projectRenderer()): Promise<void> {
  const threeD = renderer !== '2d';
  const requested: string[] = [];
  if (threeD) page.on('request', (request) => requested.push(new URL(request.url()).pathname));
  await page.goto(gamePage(renderer));
  await page.getByRole('button', { name: 'New game' }).click();
  await expect(game(page)).toHaveAttribute('data-scene', content.opening);
  if (threeD) {
    await expect.poll(() => requested, 'the 3D renderer loads the player model').toContain(playerModel);
  }
}

export async function enterPub(page: Page): Promise<void> {
  await clickHotspot(page, content.pubDoor);
  await expect(game(page)).toHaveAttribute('data-scene', content.pubInterior);
}

/** Clicks the room at scene pixels, whatever size the canvas is scaled to. */
export async function clickScene(page: Page, at: { x: number; y: number }): Promise<void> {
  const canvas = page.locator('#game canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no game canvas');
  const scale = box.width / 1280;
  await canvas.click({ position: { x: at.x * scale, y: at.y * scale } });
}

/**
 * The centre of a hotspot's button, in page pixels. In 3D the button lies over the hotspot's
 * model but lets the pointer through to the canvas, so pointing there points at the model.
 */
async function hotspotCentre(page: Page, name: string | RegExp): Promise<{ x: number; y: number }> {
  const box = await hotspot(page, name).boundingBox();
  if (!box) throw new Error(`no hotspot ${name}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Moves the pointer over the room where a hotspot is drawn, whichever renderer draws it. */
export async function pointAtHotspot(page: Page, name: string | RegExp): Promise<void> {
  const at = await hotspotCentre(page, name);
  await page.mouse.move(at.x, at.y);
}

/** Clicks the room where a hotspot is drawn, whichever renderer draws it. */
export async function clickHotspot(page: Page, name: string | RegExp): Promise<void> {
  const at = await hotspotCentre(page, name);
  await page.mouse.click(at.x, at.y);
}

/** The colour the canvas shows at scene pixels, read from a 1 x 1 screenshot. */
export async function scenePixel(page: Page, at: { x: number; y: number }): Promise<number[]> {
  const box = await page.locator('#game canvas').boundingBox();
  if (!box) throw new Error('no game canvas');
  const scale = box.width / 1280;
  const clip = { x: box.x + at.x * scale, y: box.y + at.y * scale, width: 1, height: 1 };
  const png = await page.screenshot({ clip });
  return [...firstPixel(png)];
}

// A one-pixel PNG has a single scanline, and every PNG filter leaves its first pixel as is.
function firstPixel(png: Buffer): Buffer {
  const idat: Buffer[] = [];
  for (let at = 8; at < png.length; ) {
    const length = png.readUInt32BE(at);
    if (png.toString('ascii', at + 4, at + 8) === 'IDAT') idat.push(png.subarray(at + 8, at + 8 + length));
    at += length + 12;
  }
  return inflateSync(Buffer.concat(idat)).subarray(1, 4);
}

export async function playerPosition(page: Page): Promise<{ x: number; y: number } | null> {
  const value = await game(page).getAttribute('data-player');
  if (!value) return null;
  const [x, y] = value.split(',').map(Number);
  return { x, y };
}

/** Selects an inventory item, then clicks a hotspot with it. */
export async function useItemOn(page: Page, item: string | RegExp, target: string | RegExp): Promise<void> {
  await inventoryItem(page, item).click();
  await clickHotspot(page, target);
}

/**
 * Matches backend requests by path, whatever origin the build's apiBase() (src/services/api.ts)
 * resolves to: the production API, or another one when the build sets VITE_API_BASE.
 */
function apiPath(prefix: string): (url: URL) => boolean {
  return (url) => url.pathname.startsWith(prefix);
}

export type { DialogueTurn };

/**
 * Stands in for the backend's dialogue endpoint (#6): `turn` gets the request body
 * ({ character, reply }; reply is null when the conversation starts) and returns the
 * response the game should see.
 */
export async function stubDialogue(
  page: Page,
  turn: (body: { character: string; reply: string | null }) => DialogueTurn,
): Promise<void> {
  await page.route(apiPath('/dialogue/'), (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(turn(route.request().postDataJSON())),
    }),
  );
}

/**
 * Stands in for the backend's save storage (#10): whatever the game PUTs or POSTs to a path
 * is what a later GET of that path returns. Share one `store` between pages to survive a
 * closed browser tab.
 */
export async function stubSaves(page: Page, store: Map<string, string>): Promise<void> {
  await page.route(apiPath('/saves'), async (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'GET') {
      const saved = store.get(path);
      // No save is 204, not 404: the browser logs a 404 as a console error, which fails the test.
      if (saved) await route.fulfill({ status: 200, contentType: 'application/json', body: saved });
      else await route.fulfill({ status: 204, body: '' });
      return;
    }
    if (route.request().method() === 'DELETE') store.delete(path);
    else store.set(path, route.request().postData() ?? '');
    await route.fulfill({ status: 204, body: '' });
  });
}

/** A saved game, as the title screen's Continue loads it, with the fields the tests set; seedSave stamps the rest. */
export type Save = Required<Pick<SaveGame, 'room' | 'act' | 'goals' | 'stats'>>;

let seeds = 0;

/**
 * Puts a saved game where Continue finds it: in this browser and behind the backend's saves.
 * Each call seeds once, on the next page load; whatever the game saves afterwards is what a
 * reload finds, until the next call.
 */
export async function seedSave(page: Page, save: Save): Promise<void> {
  const game = JSON.stringify({ version: 1, savedAt: new Date().toISOString(), ...save });
  // Init scripts rerun, in order, on every navigation. The tab's sessionStorage remembers
  // which seeds were already written, so a reload doesn't overwrite what the game saved.
  const seed = `punland.e2e.seed.${++seeds}`;
  await page.addInitScript(
    ([value, seed]) => {
      if (sessionStorage.getItem(seed) !== null) return;
      localStorage.setItem('punland.save.v1', value);
      sessionStorage.setItem(seed, 'written');
    },
    [game, seed] as const,
  );
  let latest: string | null = game;
  await page.route(apiPath('/saves'), async (route: Route) => {
    const method = route.request().method();
    if (method === 'GET') {
      if (latest) await route.fulfill({ status: 200, contentType: 'application/json', body: latest });
      else await route.fulfill({ status: 204, body: '' });
      return;
    }
    latest = method === 'DELETE' ? null : (route.request().postData() ?? '');
    await route.fulfill({ status: 204, body: '' });
  });
}

export async function continueGame(page: Page): Promise<void> {
  await page.goto(gamePage());
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(game(page)).toHaveAttribute('data-scene', /\S/);
}
