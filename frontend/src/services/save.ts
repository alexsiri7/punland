// Saved-game storage behind a small interface, so the title screen only asks
// "is there a save?" and "load it", and the game only says "save this".
// The game autosaves through BackendSaveStore: a copy in this browser
// (LocalSaveStore) and one behind the backend, keyed by the anonymous player
// id (./player.ts). Continue takes whichever copy is newer, so the game
// keeps saving and resuming while the backend is down.

import { apiBase } from './api';
import type { InventoryState } from '../domain/inventory';
import type { JourneyState } from '../domain/journey';
import type { SaveGame } from '../domain/save';
import { playerId } from './player';
import { safeLocalStorage } from './storage';

export type { SaveGame } from '../domain/save';

export interface SaveStore {
  load(): Promise<SaveGame | null>;
  save(game: SaveGame): Promise<void>;
  clear(): Promise<void>;
}

export const SAVE_KEY = 'punland.save.v1';

type Fields = Record<string, unknown>;

const isObject = (value: unknown): value is Fields => typeof value === 'object' && value !== null;
const isStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((v) => typeof v === 'string');

function isInventory(value: unknown): value is InventoryState {
  return isObject(value) && isStrings(value.items) && isStrings(value.pickedUp);
}

const isPoint = (value: unknown): boolean =>
  isObject(value) && typeof value.x === 'number' && typeof value.y === 'number';

function isPlace(value: unknown): boolean {
  return isObject(value) && typeof value.room === 'string' && (value.at === undefined || isPoint(value.at));
}

function isJourney(value: unknown): value is JourneyState {
  return (
    isObject(value) && isStrings(value.gathered) && isObject(value.left) && Object.values(value.left).every(isPlace)
  );
}

const isFlag = (value: unknown): boolean => ['boolean', 'number', 'string'].includes(typeof value);
const isFlags = (value: unknown): boolean => isObject(value) && !Array.isArray(value) && Object.values(value).every(isFlag);

/** A save this game can resume. Fields it doesn't know (from a newer game) are ignored. */
export function isSaveGame(value: unknown): value is SaveGame {
  if (!isObject(value)) return false;
  return (
    value.version === 1 &&
    typeof value.room === 'string' &&
    typeof value.savedAt === 'string' &&
    (value.at === undefined || isPoint(value.at)) &&
    (value.inventory === undefined || isInventory(value.inventory)) &&
    (value.journey === undefined || isJourney(value.journey)) &&
    (value.flags === undefined || isFlags(value.flags))
  );
}

/** Browser-local save. Unreadable or malformed data counts as "no save". */
export class LocalSaveStore implements SaveStore {
  constructor(private readonly storage: Storage | null = safeLocalStorage()) {}

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

export interface BackendOptions {
  base: string;
  player: string;
  fetch: typeof globalThis.fetch;
  /** How long Continue waits for the backend before going with the local copy. */
  timeoutMs: number;
}

/**
 * The local copy plus the backend's (GET/PUT/DELETE /saves). The local copy is written first
 * and the backend's in the background, in call order; a backend that is down, slow or refuses
 * never fails a save or a load, it only leaves the local copy to go on.
 */
export class BackendSaveStore implements SaveStore {
  private readonly options: BackendOptions;
  private writes: Promise<void> = Promise.resolve();

  constructor(
    private readonly local: SaveStore,
    options: Partial<BackendOptions> = {},
  ) {
    this.options = {
      base: options.base ?? apiBase(),
      player: options.player ?? playerId(),
      fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
      timeoutMs: options.timeoutMs ?? 3000,
    };
  }

  async load(): Promise<SaveGame | null> {
    const [local, remote] = await Promise.all([this.local.load(), this.remote()]);
    if (!local || !remote) return local ?? remote;
    return Date.parse(remote.savedAt) > Date.parse(local.savedAt) ? remote : local;
  }

  save(game: SaveGame): Promise<void> {
    const local = this.local.save(game);
    const remote = this.send('PUT', JSON.stringify(game));
    return Promise.all([local, remote]).then(() => undefined);
  }

  async clear(): Promise<void> {
    await this.local.clear();
    void this.send('DELETE');
  }

  private async remote(): Promise<SaveGame | null> {
    try {
      const res = await this.options.fetch(`${this.options.base}/saves`, {
        headers: { 'X-Player-Id': this.options.player },
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
      if (res.status !== 200) return null;
      const game: unknown = await res.json();
      return isSaveGame(game) ? game : null;
    } catch {
      return null;
    }
  }

  /** Queues a write so the backend sees them in the order the game made them. */
  private send(method: 'PUT' | 'DELETE', body?: string): Promise<void> {
    const headers: Record<string, string> = { 'X-Player-Id': this.options.player };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = body;
    }
    const write = async () => {
      await this.options.fetch(`${this.options.base}/saves`, init);
    };
    this.writes = this.writes.then(write).catch(() => undefined);
    return this.writes;
  }
}
