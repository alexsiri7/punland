import { writeFileSync } from 'node:fs';
import type { Locator, Page, Request } from '@playwright/test';
import { expect, test } from './fixtures';
import { arrive, content, continueGame, conversation, game, hotspot, pointAtHotspot, type DialogueTurn, stubDialogue } from './play';

// Acceptance tests for openspec/specs/editor/spec.md: owner sign-in (#122), edit mode and
// publishing (#123). Google, GitHub and the backend are stubbed; the backend's own tests cover
// the checks behind its answers.

const API = 'https://punland-api.interstellarai.net';

function json(body: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify(body) };
}

/** `/me` answers `owner`, from a backend that offers sign-in. */
async function backendSays(page: Page, owner: boolean) {
  await page.route(`${API}/me`, (route) => route.fulfill(json({ owner, google_client_id: 'test-client' })));
}

/**
 * Signs in through Google's redirect, with `/auth/google` answering `owner`. Returns what the
 * game sent the backend.
 */
async function signInWithGoogle(page: Page, owner: boolean): Promise<{ google: URL; sent: unknown }> {
  await backendSays(page, false);
  await page.route('https://accounts.google.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Google</title>' }),
  );
  let sent: unknown = null;
  await page.route(`${API}/auth/google`, async (route) => {
    sent = route.request().postDataJSON();
    await backendSays(page, owner);
    await route.fulfill(json({ owner }));
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Owner sign-in' }).click();
  await page.waitForURL(/accounts\.google\.com/);
  const google = new URL(page.url());
  await page.goto(`/#id_token=fake-token&state=${google.searchParams.get('state')}`);
  await expect(page.getByRole('button', { name: 'New game' })).toBeVisible();
  await expect.poll(() => sent).not.toBeNull();
  return { google, sent };
}

async function startNewGame(page: Page) {
  await page.getByRole('button', { name: 'New game' }).click();
  await expect(page.locator('#game')).toHaveAttribute('data-scene', 'coach-station');
}

test('Sign-in not configured', async ({ page }) => {
  // Requirement: Owner sign-in. Without sign-in configured the game is as before.
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'New game' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Owner sign-in' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Owner sign-out' })).toBeHidden();
  await startNewGame(page);
  await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
});

test('The owner signs in', async ({ page }) => {
  // Requirement: Owner sign-in. The owner's Google account shows the Edit button.
  const { google, sent } = await signInWithGoogle(page, true);
  expect(google.origin + google.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
  expect(google.searchParams.get('client_id')).toBe('test-client');
  expect(google.searchParams.get('response_type')).toBe('id_token');
  expect(google.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:4173/');
  expect(google.searchParams.get('state')).toBeTruthy();
  expect(sent).toEqual({ credential: 'fake-token', nonce: google.searchParams.get('nonce') });
  expect(new URL(page.url()).hash).toBe('');
  const signOut = page.getByRole('button', { name: 'Owner sign-out' });
  await expect(signOut).toBeVisible();
  await page.screenshot({ path: '/tmp/punland-owner-title.png' });

  await startNewGame(page);
  await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
  await page.screenshot({ path: '/tmp/punland-owner-game.png' });
});

test('Someone else signs in', async ({ page }) => {
  // Requirement: Owner sign-in. Anyone else is refused, with no hint that an editor exists.
  await signInWithGoogle(page, false);
  await expect(page.getByRole('button', { name: 'Owner sign-in' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Owner sign-out' })).toBeHidden();
  await startNewGame(page);
  await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
});

test('Signing out', async ({ page }) => {
  // Requirement: Owner sign-in. Signing out ends the session and the Edit button is gone.
  await backendSays(page, true);
  let signedOut: Request | null = null;
  await page.route(`${API}/auth/signout`, async (route) => {
    signedOut = route.request();
    await backendSays(page, false);
    await route.fulfill({ status: 204 });
  });
  await page.goto('/');
  await page.screenshot({ path: '/tmp/punland-owner-signout.png' });
  await page.getByRole('button', { name: 'Owner sign-out' }).click();
  await expect(page.getByRole('button', { name: 'Owner sign-in' })).toBeVisible();
  const request = signedOut as Request | null;
  expect(request?.method()).toBe('POST');
  expect(await request?.headerValue('X-Punland-CSRF')).toBe('1');
  await startNewGame(page);
  await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
});

test('The owner starts a game before the backend has answered', async ({ page }) => {
  // Requirement: Owner sign-in. The owner gets the Edit button however quickly the game starts.
  let answer = () => {};
  const answered = new Promise<void>((resolve) => (answer = resolve));
  await page.route(`${API}/me`, async (route) => {
    await answered;
    await route.fulfill(json({ owner: true, google_client_id: 'test-client' }));
  });
  await page.goto('/');
  const rendererLoaded = page.waitForResponse(/\/assets\/renderer-[^/]*\.js$/);
  await page.getByRole('button', { name: 'New game' }).click();
  await rendererLoaded;
  answer();
  await expect(page.locator('#game')).toHaveAttribute('data-scene', 'coach-station');
  await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
});

test('Signing out while the backend is unreachable', async ({ page }) => {
  // Requirement: Owner sign-in. Sign-out ends the session only when the backend confirms it.
  // A failed request stubbed by page.route logs a console error, so fetch itself fails here.
  await page.addInitScript((url) => {
    const fetch = window.fetch.bind(window);
    window.fetch = (input, init) =>
      String(input) === url ? Promise.reject(new TypeError('Failed to fetch')) : fetch(input, init);
  }, `${API}/auth/signout`);
  await backendSays(page, true);
  await page.goto('/');
  await page.getByRole('button', { name: 'Owner sign-out' }).click();
  await expect(page.getByRole('button', { name: 'Owner sign-out' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Owner sign-in' })).toBeHidden();
  await startNewGame(page);
  await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
});

// Edit mode and publishing (#123), in the coach station.

const editMode = (page: Page): Locator => page.getByRole('region', { name: 'Edit mode' });
const editHandle = (page: Page, name: string | RegExp): Locator => editMode(page).getByRole('button', { name });
const editTool = (page: Page, name: string): Locator =>
  page.getByRole('toolbar', { name: 'Editor' }).getByRole('button', { name, exact: true });
const copSpot = /^beetroot cop spot$/i;
/** Where the tests move the cop to: on the coach station's floor, clear of the other hotspots. */
const newCopSpot = { x: 700, y: 560 };

/** Page pixels for scene pixels. */
async function onPage(page: Page, at: { x: number; y: number }): Promise<{ x: number; y: number }> {
  const box = await page.locator('#game canvas').boundingBox();
  if (!box) throw new Error('no game canvas');
  const scale = box.width / 1280;
  return { x: box.x + at.x * scale, y: box.y + at.y * scale };
}

async function centre(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('not shown');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Drags an edit handle to scene pixels with the mouse. */
async function drag(page: Page, handle: Locator, to: { x: number; y: number }): Promise<void> {
  const from = await centre(handle);
  const target = await onPage(page, to);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.mouse.up();
}

/** The owner, just after the Arrival in the coach station. */
async function ownerArrives(page: Page) {
  await backendSays(page, true);
  await arrive(page);
}

/** The owner moves the cop to newCopSpot, and goes back to play. */
async function moveTheCop(page: Page) {
  await page.getByRole('button', { name: 'Edit' }).click();
  await drag(page, editHandle(page, copSpot), newCopSpot);
  const moved = await centre(editHandle(page, copSpot));
  const expected = await onPage(page, newCopSpot);
  expect(Math.abs(moved.x - expected.x)).toBeLessThan(3);
  expect(Math.abs(moved.y - expected.y)).toBeLessThan(3);
}

test('Entering and leaving edit mode', async ({ page }) => {
  // Requirement: Edit mode. Edit shows every hotspot, spot, walk-to point and the floor outline.
  await ownerArrives(page);
  const edit = page.getByRole('button', { name: 'Edit' });
  await edit.click();
  await expect(editMode(page)).toBeVisible();
  await expect(edit).toHaveAttribute('aria-pressed', 'true');
  await expect(editHandle(page, copSpot)).toBeVisible();
  await expect(editHandle(page, /^beetroot cop walk-to$/i)).toBeVisible();
  await expect(editHandle(page, 'Start')).toBeVisible();
  await expect(editHandle(page, /^floor corner/i)).toHaveCount(4);
  await expect(editMode(page).locator('.edit-floor')).toHaveCount(1);
  await expect(editMode(page).locator('.edit-label', { hasText: '→ opening' })).toHaveCount(1);
  await page.screenshot({ path: '/tmp/punland-edit.png' });

  await edit.click();
  await expect(editMode(page)).toHaveCount(0);
  await expect(edit).toHaveAttribute('aria-pressed', 'false');
});

test('Dragging a spot', async ({ page }) => {
  // Requirement: Edit mode. A dragged spot is played at once, before anything is published.
  await stubDialogue(page, (): DialogueTurn => ({ line: 'Move along.', options: [], goal_reached: false, ended: true }));
  await ownerArrives(page);
  const before = await centre(hotspot(page, content.cop));
  await moveTheCop(page);
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.screenshot({ path: '/tmp/punland-edit-moved.png' });

  const after = await centre(hotspot(page, content.cop));
  expect(Math.abs(after.x - before.x)).toBeGreaterThan(100);
  await page.mouse.move(before.x, before.y);
  await expect(game(page)).not.toHaveAttribute('data-hover', content.cop);
  await pointAtHotspot(page, content.cop);
  await expect(game(page)).toHaveAttribute('data-hover', content.cop);
  await page.mouse.click(after.x, after.y);
  await expect(conversation(page)).toHaveAccessibleName(content.cop);
});

test('A draft survives a reload', async ({ page }) => {
  // Requirement: Edit mode. The draft is kept in the browser until it is published.
  await ownerArrives(page);
  await moveTheCop(page);
  const moved = await centre(editHandle(page, copSpot));
  await page.reload();
  await continueGame(page);
  await page.getByRole('button', { name: 'Edit' }).click();
  const kept = await centre(editHandle(page, copSpot));
  expect(Math.abs(kept.x - moved.x)).toBeLessThan(3);
  expect(Math.abs(kept.y - moved.y)).toBeLessThan(3);
});

test('Publishing opens a pull request', async ({ page }) => {
  // Requirement: Publishing a room. The backend gets the room's points and both screenshots.
  let sent: Request | null = null;
  await page.route(`${API}/editor/rooms/coach-station/publish`, async (route) => {
    sent = route.request();
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ url: 'https://github.com/alexsiri7/punland/pull/999', number: 999 }),
    });
  });
  await ownerArrives(page);
  await moveTheCop(page);
  await editTool(page, 'Publish').click();
  const link = page.getByRole('status').getByRole('link');
  await expect(link).toHaveAttribute('href', 'https://github.com/alexsiri7/punland/pull/999');
  await page.screenshot({ path: '/tmp/punland-edit-published.png' });

  const request = sent as Request | null;
  expect(request?.method()).toBe('POST');
  expect(await request?.headerValue('X-Punland-CSRF')).toBe('1');
  type Layout = { hotspots: Record<string, { at?: { x: number; y: number } }> };
  const body = request?.postDataJSON() as {
    base: Layout;
    layout: Layout;
    before: string;
    after: string;
  };
  const at = body.layout.hotspots.cop?.at;
  expect(body.base.hotspots.cop?.at).toEqual({ x: 1040, y: 552 });
  expect(Math.abs((at?.x ?? 0) - newCopSpot.x)).toBeLessThanOrEqual(2);
  expect(Math.abs((at?.y ?? 0) - newCopSpot.y)).toBeLessThanOrEqual(2);
  for (const [name, png] of [
    ['before', body.before],
    ['after', body.after],
  ] as const) {
    expect(png.startsWith('iVBORw0KGgo')).toBe(true);
    writeFileSync(`/tmp/punland-edit-${name}.png`, Buffer.from(png, 'base64'));
  }
  expect(body.before).not.toBe(body.after);
  await expect(editTool(page, 'Publish')).toBeDisabled();
});

test('An invalid edit is refused', async ({ page }) => {
  // Requirement: Publishing a room. An edit that breaks the room is refused, and nothing is sent.
  let sent = false;
  await page.route(`${API}/editor/rooms/**`, async (route) => {
    sent = true;
    await route.abort();
  });
  await ownerArrives(page);
  await page.getByRole('button', { name: 'Edit' }).click();
  // The floor's third corner pulled in past the line between its neighbours: not convex.
  await drag(page, editHandle(page, 'Floor corner 3'), { x: 640, y: 560 });
  await expect(page.getByRole('status')).toContainText('walkable: must be a convex polygon');
  await editTool(page, 'Publish').click();
  await expect(page.getByRole('status')).toContainText("Can't publish:");
  await page.screenshot({ path: '/tmp/punland-edit-invalid.png' });
  expect(sent).toBe(false);
});

test('Not the owner', async ({ page }) => {
  // Requirement: Edit mode. Anyone but the owner has no edit mode.
  await backendSays(page, false);
  await arrive(page);
  await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  await page.keyboard.press('e');
  await expect(editMode(page)).toHaveCount(0);
});
