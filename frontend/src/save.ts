// Saved-game storage behind a small interface, so the title screen only asks
// "is there a save?" and "load it". Issue #10 swaps LocalSaveStore for a store
// that autosaves through the backend (Supabase) with an anonymous player id;
// the title screen and the game should not need to change when it does.

/** Everything needed to resume a game. Grows as features land (#5, #9, #11). */
export interface SaveGame {
  version: 1;
  /** Room id the player was in, from the content data. */
  room: string;
  /** ISO timestamp of the save. */
  savedAt: string;
}

export interface SaveStore {
  hasSave(): Promise<boolean>;
  load(): Promise<SaveGame | null>;
  save(game: SaveGame): Promise<void>;
  clear(): Promise<void>;
}

export const SAVE_KEY = 'punland.save.v1';

function isSaveGame(value: unknown): value is SaveGame {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.version === 1 && typeof v.room === 'string' && typeof v.savedAt === 'string';
}

/** Browser-local save. Unreadable or malformed data counts as "no save". */
export class LocalSaveStore implements SaveStore {
  constructor(private readonly storage: Storage | null = safeLocalStorage()) {}

  async hasSave(): Promise<boolean> {
    return (await this.load()) !== null;
  }

  async load(): Promise<SaveGame | null> {
    try {
      const raw = this.storage?.getItem(SAVE_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      return isSaveGame(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  async save(game: SaveGame): Promise<void> {
    try {
      this.storage?.setItem(SAVE_KEY, JSON.stringify(game));
    } catch {
      // Storage full or blocked (private mode): the game keeps running unsaved.
    }
  }

  async clear(): Promise<void> {
    try {
      this.storage?.removeItem(SAVE_KEY);
    } catch {
      // ignore
    }
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
