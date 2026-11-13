import type { FloorPoint, PublishResult, RoomLayout } from '../domain';
import { type OwnerOptions, ownerRequest, resolve } from './owner';
import { safeLocalStorage } from './storage';

// The owner's scene editor (editor spec): edited room layouts kept in this browser until they
// are published, and publishing one, which the backend turns into a pull request.

export const EDITOR_DRAFTS_KEY = 'punland.editor.drafts.v1';

/** A room's edits: `base` is the layout the deployed room had when they began. */
export interface Draft {
  base: RoomLayout;
  layout: RoomLayout;
}

/** The drafts, by room id. */
export type Drafts = Record<string, Draft>;

/** The drafts kept in this browser; none when storage is blocked or holds something else. */
export function loadDrafts(storage: Storage | null = safeLocalStorage()): Drafts {
  try {
    const raw = storage?.getItem(EDITOR_DRAFTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!isRecord(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, Draft] => {
        const draft = entry[1];
        return isRecord(draft) && isLayout(draft.base) && isLayout(draft.layout);
      }),
    );
  } catch {
    return {};
  }
}

export function saveDrafts(drafts: Drafts, storage: Storage | null = safeLocalStorage()): void {
  try {
    if (Object.keys(drafts).length === 0) storage?.removeItem(EDITOR_DRAFTS_KEY);
    else storage?.setItem(EDITOR_DRAFTS_KEY, JSON.stringify(drafts));
  } catch {
    // Storage full or blocked: the draft lasts until the page is closed.
  }
}

/** The answers the backend gives for a publish that didn't open a pull request, by status. */
const REFUSED: Readonly<Record<number, string>> = {
  401: "You're signed out: sign in again to publish.",
  503: "Publishing isn't set up on the server.",
};

/**
 * Sends a room's draft and its before/after screenshots (base64 PNG) to the backend, which
 * opens a pull request with it. Never fails: a refusal comes back with the reason to show.
 */
export async function publishRoom(
  room: string,
  { base: from, layout }: Draft,
  shots: { before: string; after: string },
  options: Partial<OwnerOptions> = {},
): Promise<PublishResult> {
  const { base, fetch } = resolve(options);
  let res: Response;
  try {
    res = await fetch(
      `${base}/editor/rooms/${encodeURIComponent(room)}/publish`,
      ownerRequest({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base: from, layout, ...shots }),
      }),
    );
  } catch {
    return { ok: false, message: "Couldn't reach the server." };
  }
  const body: unknown = await res.json().catch(() => null);
  const field = (name: string) => (isRecord(body) && typeof body[name] === 'string' ? body[name] : null);
  if (res.status === 201) {
    const url = field('url');
    if (url) return { ok: true, url };
  }
  return { ok: false, message: REFUSED[res.status] ?? field('detail') ?? `The server refused it (${res.status}).` };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isPoint = (value: unknown): value is FloorPoint =>
  isRecord(value) && Number.isFinite(value.x) && Number.isFinite(value.y);

function isLayout(value: unknown): value is RoomLayout {
  if (!isRecord(value) || !isPoint(value.start) || !Array.isArray(value.walkable)) return false;
  if (!value.walkable.every(isPoint) || !isRecord(value.hotspots)) return false;
  return Object.values(value.hotspots).every(
    (h) => isRecord(h) && isPoint(h.walkTo) && (h.at === undefined || isPoint(h.at)),
  );
}
