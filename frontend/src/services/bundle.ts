// Fetching a game bundle's files (bundle-loading spec). A file that can't be had is an error to
// report, never a throw: a bundle the game can't load is refused with its problems listed.

export type Fetched<T> = { ok: true; value: T } | { ok: false; error: string };

type Fetch = typeof globalThis.fetch;

/** The file at `url`, parsed as JSON. */
export async function fetchJson(url: URL, fetch: Fetch): Promise<Fetched<unknown>> {
  const res = await get(url, fetch);
  if (!res.ok) return res;
  try {
    return { ok: true, value: JSON.parse(await res.value.text()) as unknown };
  } catch {
    return { ok: false, error: 'is not JSON' };
  }
}

/** The bytes of the file at `url`. */
export async function fetchBytes(url: URL, fetch: Fetch): Promise<Fetched<Uint8Array>> {
  const res = await get(url, fetch);
  if (!res.ok) return res;
  try {
    return { ok: true, value: new Uint8Array(await res.value.arrayBuffer()) };
  } catch {
    return { ok: false, error: 'could not be read' };
  }
}

async function get(url: URL, fetch: Fetch): Promise<Fetched<Response>> {
  try {
    const res = await fetch(url);
    return res.ok ? { ok: true, value: res } : { ok: false, error: `could not be loaded (${res.status})` };
  } catch {
    return { ok: false, error: 'could not be loaded' };
  }
}
