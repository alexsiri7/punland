/**
 * The layered modules the acceptance tests for spec change #25 use, with the shapes
 * docs/ARCHITECTURE.md gives them (sections 3, 4, 6 and 8). The glb contract doesn't exist until
 * B1 (#36) lands, so each module is loaded when a test asks for it: a missing module fails that
 * test alone, not the whole file. The step that builds a module may settle on a different
 * path, export or shape: change it here, in one place, in the PR that removes the tests'
 * expected-to-fail markers.
 */

import type { ContentFiles, ContentIssue } from '../../../src/content';
import type { Content, FloorPoint, GameState } from '../../../src/domain';
import type { Command, GameEvent } from '../../../src/rules';

export type { Command, Content, ContentFiles, FloorPoint, GameEvent, GameState };

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
  assets: '../../../src/assets/registry',
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
