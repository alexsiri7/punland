import { safeLocalStorage } from './storage';

// The anonymous player id: no sign-up (progress spec, "Autosave"). It is made up in the
// browser, kept in localStorage and sent to the backend as X-Player-Id, which keys the
// player's save behind it; the dialogue endpoint (#6) takes the same header.
export const PLAYER_KEY = 'punland.player.v1';

let thisPageLoad: string | null = null;

/** This browser's player id, made up on first use. Blocked storage keeps one id per page load. */
export function playerId(
  storage: Storage | null = safeLocalStorage(),
  newId: () => string = () => crypto.randomUUID(),
): string {
  try {
    const stored = storage?.getItem(PLAYER_KEY);
    if (stored) return stored;
  } catch {
    // Blocked storage: fall through to this page load's id.
  }
  thisPageLoad ??= newId();
  try {
    storage?.setItem(PLAYER_KEY, thisPageLoad);
  } catch {
    // ignore
  }
  return thisPageLoad;
}
