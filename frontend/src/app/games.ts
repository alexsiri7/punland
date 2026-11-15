import { MODELS_FILE, models, readRegistry, type Registry } from '../assets/registry';
import { type ModelFiles, validateAssets } from '../assets/validate';
import { type ContentIssue, loadContent, readContent, readManifest } from '../content';
import type { Content } from '../domain';
import { fetchBytes, fetchJson } from '../services/bundle';

/** A game to play: its content and the models it is drawn with. */
export interface Game {
  /** What its saves are stamped with. */
  id: string;
  name: string;
  content: Content;
  registry: Registry;
}

/** The game built into this engine: Tune Story's content in this repository, checked as it loads. */
export function builtInGame(): Game {
  return { id: 'tune-story', name: 'Tune Story', content: loadContent(), registry: models };
}

export type Loaded = { game: Game } | { problems: string[] };

/**
 * The game in the bundle whose manifest is at `manifestUrl` (bundle-loading spec), checked with
 * the validators the built-in game is: its content as it loads, and its registry against its
 * content and its model files. Models are named by their path on this site (`site`), not in the
 * bundle. A bundle on another origin, with a schema version this engine doesn't play, or with
 * any problem is refused, its problems listed by file and field.
 */
export async function loadBundle(
  manifestUrl: URL,
  site: URL,
  fetch: typeof globalThis.fetch = globalThis.fetch.bind(globalThis),
): Promise<Loaded> {
  if (manifestUrl.origin !== site.origin) return { problems: [`${manifestUrl.href}: is not on this site`] };

  const manifestJson = await fetchJson(manifestUrl, fetch);
  if (!manifestJson.ok) return { problems: [`manifest.json: ${manifestJson.error}`] };
  const { manifest, issues } = readManifest(manifestJson.value);
  if (!manifest) return { problems: issues.map(describe) };

  const wanted = manifest.files.filter((file) => file.startsWith('content/') || file === MODELS_FILE);
  const fetched = await Promise.all(
    wanted.map(async (file) => [file, await fetchJson(new URL(file, manifestUrl), fetch)] as const),
  );
  const files: Record<string, unknown> = {};
  const problems: string[] = [];
  for (const [file, result] of fetched) {
    if (result.ok) files[file] = result.value;
    else problems.push(`${file}: ${result.error}`);
  }
  if (problems.length > 0) return { problems };

  const { content, issues: contentIssues } = readContent(files);
  if (!content) return { problems: contentIssues.map(describe) };

  const registryJson = files[MODELS_FILE];
  const { registry } = readRegistry(registryJson);
  const assetIssues = validateAssets(registryJson, content, await modelFiles(registry, site, fetch));
  if (assetIssues.length > 0) return { problems: assetIssues.map(describe) };

  return { game: { id: manifest.game, name: manifest.name, content, registry } };
}

/** The registry's model files that can be had; validateAssets reports the rest as missing. */
async function modelFiles(registry: Registry, site: URL, fetch: typeof globalThis.fetch): Promise<ModelFiles> {
  const paths = [...new Set(Object.values(registry).map(({ model3d }) => model3d.file))];
  const fetched = await Promise.all(
    paths.map(async (path) => [path, await fetchBytes(new URL(path, new URL('/', site)), fetch)] as const),
  );
  return Object.fromEntries(fetched.flatMap(([path, result]) => (result.ok ? [[path, result.value]] : [])));
}

function describe({ file, field, message }: ContentIssue): string {
  return `${file}${field ? ` ${field}` : ''}: ${message}`;
}
