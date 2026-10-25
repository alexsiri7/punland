// Backend (FastAPI on Railway) base URL. VITE_API_BASE overrides it at build
// time; otherwise the Vite dev server talks to a local backend and every
// build (production, Pages previews, and the e2e build served from localhost)
// talks to the production API. A new API origin also needs a connect-src
// change in public/_headers.
const PROD_API = 'https://punland-api.interstellarai.net';

export function apiBase(): string {
  const fromEnv = import.meta.env.VITE_API_BASE as string | undefined;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const host = globalThis.location?.hostname ?? '';
  if (import.meta.env.DEV && (host === 'localhost' || host === '127.0.0.1')) return 'http://localhost:8000';
  return PROD_API;
}

export interface Health {
  status: string;
  version?: string;
}

export async function fetchHealth(signal?: AbortSignal): Promise<Health> {
  const res = await fetch(`${apiBase()}/health`, { signal });
  if (!res.ok) throw new Error(`health check failed: ${res.status}`);
  return (await res.json()) as Health;
}
