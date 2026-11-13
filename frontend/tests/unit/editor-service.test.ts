import { describe, expect, it, vi } from 'vitest';
import { layoutOf, moveHandle } from '../../src/domain';
import { EDITOR_DRAFTS_KEY, loadDrafts, publishRoom, saveDrafts } from '../../src/services/editor';
import { CSRF_HEADER } from '../../src/services/owner';
import { content } from './fixtures/content';

// The owner's editor in the browser (editor spec): drafts kept here, and publishing one.

const base = 'https://api.test';
const layout = layoutOf(content.rooms.street!);
const moved = moveHandle(layout, { kind: 'start' }, { x: 120, y: 560 });
const shots = { before: 'iVBORw0KGgo-before', after: 'iVBORw0KGgo-after' };

function answering(status: number, body: unknown) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));
}

describe('publishRoom', () => {
  it("posts the room's layout and screenshots with the owner's session and the CSRF header", async () => {
    const fetch = answering(201, { url: 'https://github.com/pull/7', number: 7 });
    expect(await publishRoom('coach-station', moved, shots, { base, fetch })).toEqual({
      ok: true,
      url: 'https://github.com/pull/7',
    });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(`${base}/editor/rooms/coach-station/publish`);
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('include');
    expect(init?.headers).toMatchObject({ [CSRF_HEADER]: '1', 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init?.body))).toEqual({ layout: moved, ...shots });
  });

  it('says why the backend refused', async () => {
    const refused = async (status: number, body: unknown) =>
      publishRoom('street', moved, shots, { base, fetch: answering(status, body) });
    expect(await refused(401, { detail: 'Not signed in' })).toEqual({
      ok: false,
      message: "You're signed out: sign in again to publish.",
    });
    expect(await refused(503, { detail: "Publishing isn't set up." })).toEqual({
      ok: false,
      message: "Publishing isn't set up on the server.",
    });
    expect(await refused(422, { detail: 'Nothing to publish.' })).toEqual({ ok: false, message: 'Nothing to publish.' });
    expect(await refused(500, null)).toEqual({ ok: false, message: 'The server refused it (500).' });
    const down = vi.fn(async () => {
      throw new TypeError('offline');
    });
    expect(await publishRoom('street', moved, shots, { base, fetch: down })).toEqual({
      ok: false,
      message: "Couldn't reach the server.",
    });
  });
});

describe('drafts', () => {
  it('are kept in this browser', () => {
    saveDrafts({ street: { base: layout, layout: moved } });
    expect(loadDrafts()).toEqual({ street: { base: layout, layout: moved } });
    saveDrafts({});
    expect(localStorage.getItem(EDITOR_DRAFTS_KEY)).toBeNull();
  });

  it('are none when storage holds something else', () => {
    localStorage.setItem(EDITOR_DRAFTS_KEY, '{nope');
    expect(loadDrafts()).toEqual({});
    localStorage.setItem(EDITOR_DRAFTS_KEY, JSON.stringify({ street: { base: layout, layout: { start: 1 } } }));
    expect(loadDrafts()).toEqual({});
    localStorage.removeItem(EDITOR_DRAFTS_KEY);
  });
});
