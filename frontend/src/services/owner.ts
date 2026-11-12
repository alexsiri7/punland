import { apiBase } from './api';
import { safeSessionStorage } from './storage';

// Owner sign-in (editor spec): Google's redirect sign-in, so no Google script or frame and no
// CSP change. Google sends the ID token back in the URL fragment; the backend checks it and
// sets the owner's session cookie. Every owner request carries the CSRF header.
export const CSRF_HEADER = 'X-Punland-CSRF';
export const SIGN_IN_KEY = 'punland.signin.v1';
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';

export interface OwnerStatus {
  owner: boolean;
  /** Set only when the backend offers sign-in. */
  googleClientId: string | null;
}

export interface OwnerOptions {
  base: string;
  fetch: typeof globalThis.fetch;
}

const NOBODY: OwnerStatus = { owner: false, googleClientId: null };

function resolve(options: Partial<OwnerOptions>): OwnerOptions {
  return { base: options.base ?? apiBase(), fetch: options.fetch ?? globalThis.fetch.bind(globalThis) };
}

function ownerRequest(init: RequestInit = {}): RequestInit {
  return { ...init, credentials: 'include', headers: { ...init.headers, [CSRF_HEADER]: '1' } };
}

/** Whether this browser holds the owner's session; nobody when the backend can't say. */
export async function fetchOwner(options: Partial<OwnerOptions> = {}): Promise<OwnerStatus> {
  const { base, fetch } = resolve(options);
  try {
    const res = await fetch(`${base}/me`, ownerRequest({ signal: AbortSignal.timeout(3000) }));
    if (res.status !== 200) return NOBODY;
    const body: unknown = await res.json();
    if (typeof body !== 'object' || body === null) return NOBODY;
    const { owner, google_client_id: id } = body as Record<string, unknown>;
    return { owner: owner === true, googleClientId: typeof id === 'string' && id !== '' ? id : null };
  } catch {
    return NOBODY;
  }
}

/** Google's sign-in page for this client; remembers its state and nonce for completeSignIn. */
export function signInUrl(clientId: string): string {
  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  safeSessionStorage()?.setItem(SIGN_IN_KEY, JSON.stringify({ state, nonce }));
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${location.origin}/`,
    response_type: 'id_token',
    scope: 'openid email',
    nonce,
    state,
    prompt: 'select_account',
  });
  return `${GOOGLE_AUTH}?${params.toString()}`;
}

function takeSignIn(): { state: string; nonce: string } | null {
  const storage = safeSessionStorage();
  const raw = storage?.getItem(SIGN_IN_KEY) ?? null;
  storage?.removeItem(SIGN_IN_KEY);
  try {
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (typeof value !== 'object' || value === null) return null;
    const { state, nonce } = value as Record<string, unknown>;
    return typeof state === 'string' && typeof nonce === 'string' ? { state, nonce } : null;
  } catch {
    return null;
  }
}

/**
 * Finishes a sign-in Google redirected back from: takes the ID token out of the address at once
 * and hands it to the backend if the state is the one signInUrl made. Never fails.
 */
export async function completeSignIn(options: Partial<OwnerOptions> = {}): Promise<void> {
  const answer = new URLSearchParams(location.hash.slice(1));
  if (!answer.has('id_token') && !answer.has('error')) return;
  history.replaceState(null, '', location.pathname + location.search);
  const expected = takeSignIn();
  const credential = answer.get('id_token');
  if (!expected || !credential || answer.get('state') !== expected.state) return;
  const { base, fetch } = resolve(options);
  try {
    await fetch(
      `${base}/auth/google`,
      ownerRequest({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential, nonce: expected.nonce }),
      }),
    );
  } catch {
    // Not signed in: the title screen offers sign-in again.
  }
}

/** Ends the owner's session; false when the backend did not confirm it. Never fails. */
export async function signOut(options: Partial<OwnerOptions> = {}): Promise<boolean> {
  const { base, fetch } = resolve(options);
  try {
    const res = await fetch(`${base}/auth/signout`, ownerRequest({ method: 'POST' }));
    return res.ok;
  } catch {
    return false;
  }
}
