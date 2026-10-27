import { type ModelId, type Rect, SCENE } from '../domain';
import file from './models.json';

/**
 * The model registry (docs/ARCHITECTURE.md, section 6): how every scene, character and object
 * looks, by the model id content gives it. It holds no logic: never what a thing does, only its
 * art and its hit areas. Each entry has one variant per renderer; the 2D one is `sprite2d`.
 */

export const MODELS_FILE = 'assets/models.json';

export type ModelKind = 'scene' | 'character' | 'object';

/** A room's art in 2D. */
export interface SceneSprite {
  /** Its layers under public/, as scripts/render-art.mjs writes them, e.g. `rooms/opening/art.json`. */
  layers: string;
  /** Each hotspot's hit area in scene pixels, by hotspot id (a `node` hotspot's id is its node). */
  hotspots: Readonly<Record<string, Rect>>;
}

/** A character or object in 2D: the actor layer that draws it in each room's art. */
export interface ActorSprite {
  actor: string;
}

export type Model =
  | { id: ModelId; kind: 'scene'; sprite2d: SceneSprite }
  | { id: ModelId; kind: 'character' | 'object'; sprite2d: ActorSprite };

export type Registry = Readonly<Record<ModelId, Model>>;

/** A problem in an asset file or in the content's use of one, like a content problem (src/content). */
export interface AssetIssue {
  /** By its path under src/, or under public/ for art. */
  file: string;
  /** E.g. `models[0].sprite2d.hotspots.door`; empty for the file as a whole. */
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

/** The room art of a scene model, if it is one. */
export function sceneSprite(model: ModelId): SceneSprite | null {
  const entry = Object.hasOwn(models, model) ? models[model] : undefined;
  return entry?.kind === 'scene' ? entry.sprite2d : null;
}

/** A hotspot's hit area in a scene model's room art, in scene pixels. */
export function hotspotRect(scene: ModelId, hotspot: string): Rect | null {
  const hotspots = sceneSprite(scene)?.hotspots;
  return hotspots && Object.hasOwn(hotspots, hotspot) ? (hotspots[hotspot] ?? null) : null;
}

/** The actor layer of a character or object model, if it is one. */
export function actorOf(model: ModelId): string | null {
  const entry = Object.hasOwn(models, model) ? models[model] : undefined;
  return entry && entry.kind !== 'scene' ? entry.sprite2d.actor : null;
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
  const { id, kind, sprite2d } = entry;
  if (!isText(id)) problem(`${at}.id`, 'must be a model id');
  if (!isObject(sprite2d)) problem(`${at}.sprite2d`, 'must be an object');
  if (kind !== 'scene' && kind !== 'character' && kind !== 'object') {
    problem(`${at}.kind`, 'must be scene, character or object');
    return null;
  }
  if (!isText(id) || !isObject(sprite2d)) return null;
  if (kind === 'scene') {
    const scene = readScene(sprite2d, `${at}.sprite2d`, problem);
    return scene && { id, kind, sprite2d: scene };
  }
  if (!isText(sprite2d.actor)) {
    problem(`${at}.sprite2d.actor`, 'must be the name of an actor layer');
    return null;
  }
  return { id, kind, sprite2d: { actor: sprite2d.actor } };
}

function readScene(sprite: Record<string, unknown>, at: string, problem: Problem): SceneSprite | null {
  const { layers, hotspots } = sprite;
  if (!isText(layers)) problem(`${at}.layers`, 'must be the path of an art.json under public/');
  if (!isObject(hotspots)) {
    problem(`${at}.hotspots`, 'must be an object');
    return null;
  }
  const rects: Record<string, Rect> = {};
  let valid = isText(layers);
  for (const [hotspot, value] of Object.entries(hotspots)) {
    const rect = readRect(value);
    if (rect) rects[hotspot] = rect;
    else {
      problem(`${at}.hotspots.${hotspot}`, `must be a rect inside the ${SCENE.width} × ${SCENE.height} scene`);
      valid = false;
    }
  }
  return valid && isText(layers) ? { layers, hotspots: rects } : null;
}

function readRect(value: unknown): Rect | null {
  if (!isObject(value)) return null;
  const { x, y, width, height } = value;
  if (!isNumber(x) || !isNumber(y) || !isNumber(width) || !isNumber(height)) return null;
  if (x < 0 || y < 0 || width < 0 || height < 0) return null;
  return x + width <= SCENE.width && y + height <= SCENE.height ? { x, y, width, height } : null;
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
