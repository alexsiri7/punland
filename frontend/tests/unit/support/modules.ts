/**
 * The layered modules the acceptance tests for spec change #25 use, with the shapes
 * docs/ARCHITECTURE.md gives them (sections 3, 4, 6 and 8). Most don't exist until their
 * migration step lands, so each is loaded when a test asks for it: a missing module fails that
 * test alone, not the whole file. The step that builds a module may settle on a different
 * path, export or shape: change it here, in one place, in the PR that removes the tests'
 * expected-to-fail markers.
 */

import type { ContentFiles, ContentIssue } from '../../../src/content';
import type { Content as DomainContent, FloorPoint, GameState, Hotspot, Room } from '../../../src/domain';
import type { Command, GameEvent } from '../../../src/rules';

export type { Command, ContentFiles, FloorPoint, GameEvent, GameState };

/**
 * Content as the domain has it, with the entities A7 (#33) adds: rooms place them through a
 * hotspot's `target`, and `objects` and `characters` name their models. Those three fields are
 * undefined until A7 lands.
 */
export type Content = Omit<DomainContent, 'rooms'> & {
  rooms: Readonly<Record<string, Omit<Room, 'hotspots'> & { hotspots: (Hotspot & { target?: EntityTarget })[] }>>;
  objects: Record<string, { model: string }>;
  characters: Record<string, { model: string }>;
};

type EntityTarget = { entity: string; at: FloorPoint } | { node: string };

export interface ContractBreach {
  file: string;
  rule: string;
}

export type ModelKind = 'scene' | 'character' | 'object';

interface Modules {
  domain: typeof import('../../../src/domain');
  rules: typeof import('../../../src/rules');
  content: {
    /** The real content when called without files. */
    loadContent(files?: ContentFiles): Content;
    validateContent(files: ContentFiles): ContentIssue[];
  };
  save: {
    toSave(state: GameState): unknown;
    /** The save as read back from storage, unchecked. */
    fromSave(save: unknown, content: Content): GameState;
  };
  assets: { models: Record<string, { kind: ModelKind }> };
  contract: { checkModel(glb: Uint8Array, kind: ModelKind, file: string): ContractBreach[] };
}

const PATHS: Record<keyof Modules, string> = {
  domain: '../../../src/domain',
  rules: '../../../src/rules',
  content: '../../../src/content',
  save: '../../../src/domain/save',
  assets: '../../../src/assets',
  contract: '../../../src/assets/contract',
};

export async function load<K extends keyof Modules>(module: K): Promise<Modules[K]> {
  return import(/* @vite-ignore */ PATHS[module]);
}

/** Every content file under src/ (section 2: content/ and the assets/ registry), by its path under src/. */
export const contentFiles: ContentFiles = Object.fromEntries(
  Object.entries(
    import.meta.glob(['/src/content/**/*.json', '/src/assets/**/*.json'], { eager: true, import: 'default' }),
  ).map(([path, data]) => [path.replace(/^\/src\//, ''), data]),
);

/** Applies each command in turn, ticking after each until the player has stopped walking. */
export async function play(
  content: Content,
  state: GameState,
  commands: readonly Command[],
): Promise<{ state: GameState; events: GameEvent[] }> {
  const { apply } = await load('rules');
  const events: GameEvent[] = [];
  for (const command of commands) {
    let step = apply(content, state, command);
    events.push(...step.events);
    for (let ticks = 0; step.state.walk !== null && ticks < 1000; ticks++) {
      step = apply(content, step.state, { type: 'tick', dtMs: 50 });
      events.push(...step.events);
    }
    state = step.state;
  }
  return { state, events };
}
