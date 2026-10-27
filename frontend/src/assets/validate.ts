import type { Content, FloorPoint, ModelId, Room } from '../domain';
import { checkModel, offFloor } from './contract';
import { type Glb, readGlb } from './glb';
import { type AssetIssue, MODELS_FILE, type Model, type ModelKind, readRegistry } from './registry';

/**
 * The registry checked against the content and the model files (docs/ARCHITECTURE.md, section 6).
 * It runs in the unit tests, not as the game loads: the browser can't see which files are under public/.
 */

/** The model files under public/ (models/<kind>/<id>.glb), by path. */
export type ModelFiles = Readonly<Record<string, Uint8Array>>;

/**
 * Every problem in models.json (`json`, parsed) and in how `content` uses it: every model id in
 * the content is in the registry with the right kind, and every `model3d` file is in `files`, at
 * the path its id gives it, and follows the asset contract (contract.ts); a broken rule is
 * reported with the rule in the field. A room's scene file has a `hit_<node>` node for each of
 * its `node` hotspots, and every floor point of the room (its floor, start, walk-to and entity
 * points, and the exits into it) lands on the file's `floor` seen from its `cam_main`. A model is
 * named by its id in a field, e.g. `models[id=scene/opening].model3d.file`.
 */
export function validateAssets(json: unknown, content: Content, files: ModelFiles): AssetIssue[] {
  const { registry, issues } = readRegistry(json);
  const model = (id: ModelId, kind: ModelKind, file: string, field: string): Model | undefined => {
    const entry = Object.hasOwn(registry, id) ? registry[id] : undefined;
    if (!entry) issues.push({ file, field, message: `"${id}" is not in the model registry` });
    else if (entry.kind !== kind) issues.push({ file, field, message: `"${id}" is a ${entry.kind}, not a ${kind}` });
    return entry?.kind === kind ? entry : undefined;
  };

  model(content.protagonist.model, 'character', 'content/characters.json', 'protagonist.model');
  for (const { id, model: modelId } of Object.values(content.characters)) {
    model(modelId, 'character', 'content/characters.json', `characters[id=${id}].model`);
  }
  for (const { id, model: modelId } of Object.values(content.objects)) {
    model(modelId, 'object', 'content/objects.json', `objects[id=${id}].model`);
  }

  for (const [id, room] of Object.entries(content.rooms)) {
    const scene = model(room.model, 'scene', `content/rooms/${id}.json`, 'model');
    if (!scene) continue;
    const glb = sceneFile(scene.model3d.file, files);
    if (glb) issues.push(...sceneIssues(id, room, content, glb, `public/${scene.model3d.file}`));
  }

  for (const entry of Object.values(registry)) issues.push(...modelFileIssues(entry, files));
  return issues;
}

/** The contract's location rule: models/<kind>s/<id>.glb for the entry <kind>/<id>, in lowercase kebab-case. */
function modelFileIssues(entry: Model, files: ModelFiles): AssetIssue[] {
  const { file, height } = entry.model3d;
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

/** A scene's glb file, if it is under public/ and reads as glb; checkModel reports it otherwise. */
function sceneFile(file: string, files: ModelFiles): Glb | null {
  const bytes = Object.hasOwn(files, file) ? files[file] : undefined;
  if (!bytes) return null;
  try {
    return readGlb(bytes);
  } catch {
    return null;
  }
}

/** The room `id`'s hit nodes and floor points in its scene's glb, `file`. */
function sceneIssues(id: string, room: Room, content: Content, glb: Glb, file: string): AssetIssue[] {
  const issues: AssetIssue[] = [];
  const nodes = new Set(glb.nodes.map((node) => node.name));
  for (const hotspot of room.hotspots) {
    if (!('node' in hotspot.target)) continue;
    const node = `hit_${hotspot.target.node}`;
    if (!nodes.has(node)) {
      const message = `has no node "${node}" for the hotspot "${hotspot.id}" of content/rooms/${id}.json`;
      issues.push({ file, field: `nodes: ${node}`, message });
    }
  }
  const message = `does not land on the "floor" of ${file}, seen from its "cam_main"`;
  for (const point of offFloor(glb, floorPoints(id, room, content))) {
    issues.push({ file: point.file, field: point.field, message: `(${point.x}, ${point.y}) ${message}` });
  }
  return issues;
}

/** Every floor point of the room `id`, by the file and field it is in: the exits into it are in other rooms. */
function floorPoints(id: string, room: Room, content: Content): (FloorPoint & { file: string; field: string })[] {
  const file = `content/rooms/${id}.json`;
  const points = [
    { ...room.start, file, field: 'start' },
    ...room.walkable.map((point, i) => ({ ...point, file, field: `walkable[${i}]` })),
  ];
  for (const hotspot of room.hotspots) {
    points.push({ ...hotspot.walkTo, file, field: `hotspots[id=${hotspot.id}].walkTo` });
    if ('entity' in hotspot.target) {
      points.push({ ...hotspot.target.at, file, field: `hotspots[id=${hotspot.id}].target.at` });
    }
  }
  for (const [from, other] of Object.entries(content.rooms)) {
    for (const hotspot of other.hotspots) {
      hotspot.interactions.forEach((interaction, i) =>
        interaction.effects.forEach((effect, j) => {
          if (!('goTo' in effect) || effect.goTo !== id || !effect.at) return;
          const field = `hotspots[id=${hotspot.id}].interactions[${i}].effects[${j}].at`;
          points.push({ ...effect.at, file: `content/rooms/${from}.json`, field });
        }),
      );
    }
  }
  return points;
}
