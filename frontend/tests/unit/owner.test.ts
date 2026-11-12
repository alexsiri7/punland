import { afterEach, describe, expect, it, vi } from 'vitest';
import { completeSignIn, CSRF_HEADER, fetchOwner, SIGN_IN_KEY, signInUrl, signOut } from '../../src/services/owner';

// Owner sign-in in the browser (editor spec): /me, Google's redirect and the hand-over.

const base = 'https://api.test';

function answering(status: number, body: unknown) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));
}

afterEach(() => {
  sessionStorage.clear();
  history.replaceState(null, '', '/');
});

describe('fetchOwner', () => {
  it('asks /me with the session cookie and the CSRF header', async () => {
    const fetch = answering(200, { owner: true, google_client_id: 'client-1' });
    expect(await fetchOwner({ base, fetch })).toEqual({ owner: true, googleClientId: 'client-1' });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(`${base}/me`);
    expect(init?.credentials).toBe('include');
    expect(init?.headers).toMatchObject({ [CSRF_HEADER]: '1' });
  });

  it('is nobody when sign-in is not configured or the backend does not answer', async () => {
    const nobody = { owner: false, googleClientId: null };
    expect(await fetchOwner({ base, fetch: answering(200, { status: 'ok' }) })).toEqual(nobody);
    expect(await fetchOwner({ base, fetch: answering(200, { owner: false, google_client_id: null }) })).toEqual(nobody);
    expect(await fetchOwner({ base, fetch: answering(403, { detail: 'Forbidden' }) })).toEqual(nobody);
    const down = vi.fn(async () => {
      throw new TypeError('offline');
    });
    expect(await fetchOwner({ base, fetch: down })).toEqual(nobody);
  });
});

describe('signing in', () => {
  it("sends the owner to Google's sign-in, remembering the state and nonce", () => {
    const url = new URL(signInUrl('client-1'));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    const params = url.searchParams;
    expect(params.get('client_id')).toBe('client-1');
    expect(params.get('redirect_uri')).toBe(`${location.origin}/`);
    expect(params.get('response_type')).toBe('id_token');
    expect(params.get('scope')).toBe('openid email');
    const stored = JSON.parse(sessionStorage.getItem(SIGN_IN_KEY)!) as { state: string; nonce: string };
    expect(params.get('state')).toBe(stored.state);
    expect(params.get('nonce')).toBe(stored.nonce);
  });

  it('hands the ID token Google sent back to the backend, and takes it out of the address', async () => {
    const state = new URL(signInUrl('client-1')).searchParams.get('state')!;
    const { nonce } = JSON.parse(sessionStorage.getItem(SIGN_IN_KEY)!) as { nonce: string };
    history.replaceState(null, '', `/?x=1#id_token=token-1&state=${state}`);
    const fetch = answering(200, { owner: true });
    await completeSignIn({ base, fetch });
    expect(location.hash).toBe('');
    expect(location.search).toBe('?x=1');
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(`${base}/auth/google`);
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('include');
    expect(init?.headers).toMatchObject({ [CSRF_HEADER]: '1', 'Content-Type': 'application/json' });
    expect(JSON.parse(init?.body as string)).toEqual({ credential: 'token-1', nonce });
    expect(sessionStorage.getItem(SIGN_IN_KEY)).toBeNull();
  });

  it('drops a token whose state it did not make', async () => {
    signInUrl('client-1');
    history.replaceState(null, '', '/#id_token=token-1&state=someone-elses');
    const fetch = answering(200, { owner: true });
    await completeSignIn({ base, fetch });
    expect(fetch).not.toHaveBeenCalled();
    expect(location.hash).toBe('');

    history.replaceState(null, '', '/#id_token=token-1&state=any');
    await completeSignIn({ base, fetch });
    expect(fetch).not.toHaveBeenCalled();
    expect(location.hash).toBe('');
  });

  it('takes an error from Google out of the address too', async () => {
    signInUrl('client-1');
    history.replaceState(null, '', '/#error=access_denied');
    const fetch = answering(200, {});
    await completeSignIn({ base, fetch });
    expect(fetch).not.toHaveBeenCalled();
    expect(location.hash).toBe('');
  });

  it('leaves an ordinary address alone', async () => {
    history.replaceState(null, '', '/#somewhere');
    const fetch = answering(200, {});
    await completeSignIn({ base, fetch });
    expect(fetch).not.toHaveBeenCalled();
    expect(location.hash).toBe('#somewhere');
  });
});

describe('signOut', () => {
  it('ends the session with the CSRF header, and never fails', async () => {
    const fetch = answering(200, {});
    await expect(signOut({ base, fetch })).resolves.toBe(true);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(`${base}/auth/signout`);
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('include');
    expect(init?.headers).toMatchObject({ [CSRF_HEADER]: '1' });
  });

  it('says so when the backend did not end the session', async () => {
    await expect(signOut({ base, fetch: answering(503, {}) })).resolves.toBe(false);
    await expect(signOut({ base, fetch: vi.fn(async () => Promise.reject(new TypeError('offline'))) })).resolves.toBe(false);
  });
});
