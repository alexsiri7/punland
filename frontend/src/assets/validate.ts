import type { Content, ModelId } from '../domain';
import { type AssetIssue, MODELS_FILE, type Model, type ModelKind, readRegistry } from './registry';

/**
 * The registry checked against the content and the art (docs/ARCHITECTURE.md, section 6). It runs
 * in the unit tests, not as the game loads: the browser can't see which files are under public/.
 */

/** Room art under public/ (rooms/<room>/art.json, written by scripts/render-art.mjs), parsed, by path. */
export type ArtFiles = Readonly<Record<string, unknown>>;

/**
 * Every problem in models.json (`json`, parsed) and in how `content` uses it: every model id in
 * the content is in the registry with the right kind, every scene's art is in `art` and has the
 * actors of the protagonist and of everything its room places, every hotspot has a rect, and
 * only placed entities come and go (`presentWhen`): a part of the scene has no actor of its own.
 * A model is named by its id in a field, e.g. `models[id=scene/opening].sprite2d.hotspots`.
 */
export function validateAssets(json: unknown, content: Content, art: ArtFiles): AssetIssue[] {
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
      if (!actors || !by || by.kind === 'scene' || actors.has(by.sprite2d.actor)) return;
      const message = `has no actor "${by.sprite2d.actor}" for ${what}`;
      issues.push({ file: `public/${layers}`, field: 'layers', message });
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
  return issues;
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
