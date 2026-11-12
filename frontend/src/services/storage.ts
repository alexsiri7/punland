/** The browser's localStorage, or null where it is blocked (some private modes throw on access). */
export function safeLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** The browser's sessionStorage, or null where it is blocked. */
export function safeSessionStorage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}
