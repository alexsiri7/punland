import type { ContentIssue } from './validate';

/**
 * A game bundle's manifest.json (bundle-loading spec, "Manifest and schema version"): the game,
 * its title, the schema version of its files (checked as it is read), and the files themselves, by their path in the
 * bundle, since a static host can't list a folder. Fields it doesn't know are ignored.
 */
export interface Manifest {
  /** The game's id, which its saves carry. */
  game: string;
  name: string;
  files: string[];
}

/** The schema version of bundle files this engine plays: any minor of this major. */
export const SUPPORTED_SCHEMA = { major: 1, minor: 0 } as const;

export const MANIFEST_FILE = 'manifest.json';

export type ManifestResult = { manifest: Manifest; issues: [] } | { manifest: null; issues: ContentIssue[] };

/** The manifest, checked, or its problems. A major schema version other than the supported one is refused. */
export function readManifest(json: unknown): ManifestResult {
  const issues: ContentIssue[] = [];
  const problem = (field: string, message: string) => issues.push({ file: MANIFEST_FILE, field, message });
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    problem('', 'must be an object');
    return { manifest: null, issues };
  }
  const { game, name, schemaVersion, files } = json as Record<string, unknown>;
  if (!isText(game)) problem('game', 'must be the id of the game');
  if (!isText(name)) problem('name', 'must be the name of the game');
  const supported = `${SUPPORTED_SCHEMA.major}.x`;
  const version = typeof schemaVersion === 'string' ? /^(\d+)\.(\d+)$/.exec(schemaVersion) : null;
  if (!version) problem('schemaVersion', `must be a version like ${SUPPORTED_SCHEMA.major}.${SUPPORTED_SCHEMA.minor}`);
  else if (Number(version[1]) !== SUPPORTED_SCHEMA.major)
    problem('schemaVersion', `is ${schemaVersion as string}, and this game plays schema version ${supported} only`);
  const isFiles = Array.isArray(files) && files.every((f) => typeof f === 'string');
  if (!isFiles) problem('files', 'must be a list of file paths');
  if (issues.length > 0 || !isText(game) || !isText(name) || !version || !isFiles) return { manifest: null, issues };
  return { manifest: { game, name, files }, issues: [] };
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && /\S/.test(value);
}
