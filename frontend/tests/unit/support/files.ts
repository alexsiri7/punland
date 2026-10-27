/**
 * Files under frontend/ read as bytes, for what the browser can't load in a unit test: the
 * model files under public/. Vitest runs in Node, but the project has no @types/node, so
 * node:fs is loaded by a name TypeScript doesn't resolve, typed with the one function used.
 */

const NODE_FS = 'node:fs';
const fs: { readFileSync(path: string): Uint8Array } = await import(/* @vite-ignore */ NODE_FS);
/** frontend/, from this file's path (jsdom's URL doesn't resolve `../` against a file: URL). */
const FRONTEND = decodeURIComponent(new URL(import.meta.url).pathname).replace(/tests\/unit\/support\/files\.ts$/, '');

/** The file at `path` under frontend/. */
export function readBytes(path: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(FRONTEND + path));
}

/** Every model file under public/models/, by its path under public/. */
export const modelFiles: Record<string, Uint8Array> = Object.fromEntries(
  Object.keys(import.meta.glob('/public/models/**/*.glb')).map((path) => [
    path.replace(/^\/public\//, ''),
    readBytes(path.slice(1)),
  ]),
);
