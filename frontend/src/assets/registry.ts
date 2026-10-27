import type { ModelId } from '../domain';
import file from './models.json';

/**
 * The model registry (docs/ARCHITECTURE.md, section 6): how every scene, character and object
 * looks, by the model id content gives it. It holds no logic: never what a thing does, only its
 * model file, which carries its anchors and hit areas.
 */

export const MODELS_FILE = 'assets/models.json';

export type ModelKind = 'scene' | 'character' | 'object';

/** A model in 3D: its glb file, which follows the asset contract (docs/ARCHITECTURE.md, section 8). */
export interface Model3d {
  /** Its path under public/, e.g. `models/characters/protagonist.glb`. */
  file: string;
  /** Whether the file is one scripts/make-placeholders.mjs writes, until a designer's replaces it. */
  placeholder: boolean;
  /** A character's height in metres, for the contract to check its file against. */
  height?: number;
}

export interface Model {
  id: ModelId;
  kind: ModelKind;
  model3d: Model3d;
}

export type Registry = Readonly<Record<ModelId, Model>>;

/** A problem in an asset file or in the content's use of one, like a content problem (src/content). */
export interface AssetIssue {
  /** By its path under src/, or under public/ for model files. */
  file: string;
  /** E.g. `models[0].model3d.file`; empty for the file as a whole. */
  field: string;
  message: string;
}

/** The registry in models.json, by model id, with the problems in its shape. */
export function readRegistry(json: unknown): { registry: Registry; issues: AssetIssue[] } {
  const issues: AssetIssue[] = [];
  const problem = (field: string, message: string) => issues.push({ file: MODELS_FILE, field, message });
  const registry: Record<ModelId, Model> = {};
  const list = isObject(json) ? json.models : undefined;
  if (!Array.isArray(list)) {
    problem('models', 'must be a list');
    return { registry, issues };
  }
  for (const [i, entry] of list.entries()) {
    const model = readModel(entry, `models[${i}]`, problem);
    if (!model) continue;
    if (Object.hasOwn(registry, model.id)) problem(`models[${i}].id`, 'is used by another model');
    else registry[model.id] = model;
  }
  return { registry, issues };
}

/** Every model, checked as it loads. */
export const models: Registry = loadRegistry(file);

/** The glb file of a model under public/, if the model is in the registry. */
export function model3dFile(model: ModelId): string | null {
  const entry = Object.hasOwn(models, model) ? models[model] : undefined;
  return entry?.model3d.file ?? null;
}

function loadRegistry(json: unknown): Registry {
  const { registry, issues } = readRegistry(json);
  if (issues.length === 0) return registry;
  const problems = issues.map(({ file, field, message }) => `  ${file} ${field}: ${message}`);
  throw new Error(`The model registry doesn't hold together:\n${problems.join('\n')}`);
}

type Problem = (field: string, message: string) => void;

function readModel(entry: unknown, at: string, problem: Problem): Model | null {
  if (!isObject(entry)) {
    problem(at, 'must be an object');
    return null;
  }
  const { id, kind } = entry;
  if (!isText(id)) problem(`${at}.id`, 'must be a model id');
  if (kind !== 'scene' && kind !== 'character' && kind !== 'object') {
    problem(`${at}.kind`, 'must be scene, character or object');
    return null;
  }
  const model3d = readModel3d(entry.model3d, `${at}.model3d`, problem);
  if (!isText(id) || !model3d) return null;
  return { id, kind, model3d };
}

function readModel3d(model: unknown, at: string, problem: Problem): Model3d | null {
  if (!isObject(model)) {
    problem(at, 'must be an object');
    return null;
  }
  const { file, placeholder, height } = model;
  const isFile = isText(file) && file.endsWith('.glb');
  const isFlag = typeof placeholder === 'boolean';
  const isHeight = height === undefined || (isNumber(height) && height > 0);
  if (!isFile) problem(`${at}.file`, 'must be the path of a .glb under public/');
  if (!isFlag) problem(`${at}.placeholder`, 'must be true or false');
  if (!isHeight) problem(`${at}.height`, 'must be a height in metres');
  if (!isFile || !isFlag || !isHeight) return null;
  return height === undefined ? { file, placeholder } : { file, placeholder, height };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && /\S/.test(value);
}
