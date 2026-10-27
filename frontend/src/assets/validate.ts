import type { Content, ModelId } from '../domain';
import { checkModel } from './contract';
import { type AssetIssue, MODELS_FILE, type Model, type Model3d, type ModelKind, readRegistry } from './registry';

/**
 * The registry checked against the content and the art (docs/ARCHITECTURE.md, section 6). It runs
 * in the unit tests, not as the game loads: the browser can't see which files are under public/.
 */

/** Room art under public/ (rooms/<room>/art.json, written by scripts/render-art.mjs), parsed, by path. */
export type ArtFiles = Readonly<Record<string, unknown>>;

/** The model files under public/ (models/<kind>/<id>.glb), by path. */
export type ModelFiles = Readonly<Record<string, Uint8Array>>;

/**
 * Every problem in models.json (`json`, parsed) and in how `content` uses it: every model id in
 * the content is in the registry with the right kind, every scene's art is in `art` and has the
 * actors of the protagonist and of everything its room places, every hotspot has a rect, and
 * only placed entities come and go (`presentWhen`): a part of the scene has no actor of its own.
 * Every `model3d` file is in `files`, at the path its id gives it, and follows the asset contract
 * (contract.ts); a broken rule is reported with the rule in the field. A model is named by its id
 * in a field, e.g. `models[id=scene/opening].sprite2d.hotspots`.
 */
export function validateAssets(json: unknown, content: Content, art: ArtFiles, files: ModelFiles): AssetIssue[] {
  const { registry, issues } = readRegistry(json);
  const model = (id: ModelId, kind: ModelKind, file: string, field: string): Model | undefined => {
    const entry = Object.hasOwn(registry, id) ? registry[id] : undefined;
    if (!entry) issues.push({ file, field, message: `"${id}" is not in the model registry` });
    else if (entry.kind !== kind) issues.push({ file, field, message: `"${id}" is a ${entry.kind}, not a ${kind}` });
    return entry?.kind === kind ? entry : undefined;
  };

  const protagonist = model(content.protagonist.model, 'character', 'content/characters.json', 'protagonist.model');
  for (const { id, model: modelId } of Object.values(content.characters)) {
    model(modelId, 'character', 'content/characters.json', `characters[id=${id}].model`);
  }
  for (const { id, model: modelId } of Object.values(content.objects)) {
    model(modelId, 'object', 'content/objects.json', `objects[id=${id}].model`);
  }

  for (const [id, room] of Object.entries(content.rooms)) {
    const scene = model(room.model, 'scene', `content/rooms/${id}.json`, 'model');
    if (scene?.kind !== 'scene') continue;
    const { layers, hotspots } = scene.sprite2d;
    const field = `models[id=${scene.id}].sprite2d`;
    const actors = actorsIn(art[layers]);
    if (!actors) {
      issues.push({ file: MODELS_FILE, field: `${field}.layers`, message: `"${layers}" is not room art` });
    }
    const drawn = (by: Model | undefined, what: string) => {
      if (!actors || !by || by.kind === 'scene') return;
      if (!by.sprite2d) {
        const message = `is needed to draw ${what} in "${layers}"`;
        issues.push({ file: MODELS_FILE, field: `models[id=${by.id}].sprite2d`, message });
      } else if (!actors.has(by.sprite2d.actor)) {
        const message = `has no actor "${by.sprite2d.actor}" for ${what}`;
        issues.push({ file: `public/${layers}`, field: 'layers', message });
      }
    };
    drawn(protagonist, 'the protagonist');
    for (const hotspot of room.hotspots) {
      if (!Object.hasOwn(hotspots, hotspot.id)) {
        issues.push({ file: MODELS_FILE, field: `${field}.hotspots`, message: `has no rect for "${hotspot.id}"` });
      }
      if (!('entity' in hotspot.target)) {
        if (hotspot.presentWhen !== undefined) {
          const message = 'is part of the scene, and sprite2d has no actor to show or hide it';
          issues.push({ file: `content/rooms/${id}.json`, field: `hotspots[id=${hotspot.id}].presentWhen`, message });
        }
        continue;
      }
      const entity = content.characters[hotspot.target.entity] ?? content.objects[hotspot.target.entity];
      if (entity && Object.hasOwn(registry, entity.model)) drawn(registry[entity.model], `the hotspot "${hotspot.id}"`);
    }
  }

  for (const entry of Object.values(registry)) {
    if (entry.model3d) issues.push(...modelFileIssues(entry, entry.model3d, files));
  }
  return issues;
}

/** The contract's location rule: models/<kind>s/<id>.glb for the entry <kind>/<id>, in lowercase kebab-case. */
function modelFileIssues(entry: Model, { file, height }: Model3d, files: ModelFiles): AssetIssue[] {
  const name = entry.id.slice(`${entry.kind}/`.length);
  const expected = `models/${entry.kind}s/${name}.glb`;
  const field = `models[id=${entry.id}].model3d.file`;
  if (!entry.id.startsWith(`${entry.kind}/`) || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
    return [{ file: MODELS_FILE, field, message: `has no file name: the id must be ${entry.kind}/<lowercase-kebab-case>` }];
  }
  if (file !== expected) return [{ file: MODELS_FILE, field, message: `must be "${expected}", after the model id` }];
  const bytes = Object.hasOwn(files, file) ? files[file] : undefined;
  if (!bytes) return [{ file: MODELS_FILE, field, message: `"${file}" is not under public/` }];
  return checkModel(bytes, entry.kind, `public/${file}`, height).map(({ file, rule, message }) => ({
    file,
    field: rule,
    message,
  }));
}

/** The actor layers of a room's art, or null if `art` isn't room art. */
function actorsIn(art: unknown): Set<string> | null {
  const layers = isObject(art) ? art.layers : undefined;
  if (!Array.isArray(layers)) return null;
  return new Set(
    layers.flatMap((layer: unknown) => (isObject(layer) && typeof layer.actor === 'string' ? [layer.actor] : [])),
  );
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
