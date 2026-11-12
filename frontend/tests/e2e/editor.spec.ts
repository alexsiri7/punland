import type { Page, Request } from '@playwright/test';
import { expect, test } from './fixtures';

// Acceptance tests for openspec/specs/editor/spec.md (#122): owner sign-in. Google and the
// backend are stubbed; the backend's own tests cover the checks behind its answers.

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
