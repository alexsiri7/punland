import { describe, expect, it } from 'vitest';
import { isEngineRule, layerViolations, srcFiles } from './support/layers';

// Acceptance tests for openspec/specs/architecture/spec.md, requirement "Layered code".
// The layers and what each may import are in docs/ARCHITECTURE.md, section 2.

describe('An import that breaks the layering', () => {
  // Requirement: Layered code. The domain and rules layers import no rendering engine, DOM,
  // browser global, network or higher layer; a breach fails the unit tests, naming the file
  // and the import.
  it('is reported with the file and the import', () => {
    const violations = layerViolations({
      'domain/state.ts': [
        "import type { View } from '../presentation/ui/view';",
        "export { apply } from '../rules/apply';",
        "export const at = { x: 0, y: 0 }; // import '../app/main'",
        "/* import { load } from '../services/api'; */",
        'export const saved = () => globalThis.localStorage;',
        "export const sent = () => self.fetch('/x');",
        'export const agent = () => window.navigator.userAgent;',
      ].join('\n'),
      'rules/apply.ts': [
        "import { at } from '../domain/state';",
        "import type { GameState } from '../domain';",
        "const later = () => import('../services/api');",
        "const rooms = import.meta.glob('../content/rooms/*.json');",
        'export const width = () => window.innerWidth;',
        "export const said = 'the document is on the table';",
      ].join('\n'),
      'content/rooms.ts': "const files = import.meta.glob('./rooms/*.json', { eager: true });",
      'content/index.ts': "const files = import.meta.glob('./**/*.json', { eager: true });",
      'presentation/ui/bar.ts': "import type { Room } from '../../domain';\nimport { models } from '../../assets';",
    });
    expect(violations).toEqual([
      { file: 'domain/state.ts', import: '../presentation/ui/view', rule: 'domain must not import presentation' },
      { file: 'domain/state.ts', import: '../rules/apply', rule: 'domain must not import rules' },
      { file: 'domain/state.ts', import: 'window', rule: 'domain uses no browser globals' },
      { file: 'domain/state.ts', import: 'localStorage', rule: 'domain uses no browser globals' },
      { file: 'domain/state.ts', import: 'fetch', rule: 'domain uses no browser globals' },
      { file: 'domain/state.ts', import: 'navigator', rule: 'domain uses no browser globals' },
      { file: 'rules/apply.ts', import: '../services/api', rule: 'rules must not import services' },
      { file: 'rules/apply.ts', import: '../content/rooms', rule: 'rules must not import content' },
      { file: 'rules/apply.ts', import: 'window', rule: 'rules uses no browser globals' },
    ]);
  });

  it('does not occur in src/', () => {
    expect(layerViolations(srcFiles)).toEqual([]);
  });
});

describe('One engine per renderer', () => {
  // Requirement: Layered code. Only presentation/phaser2d imports Phaser, and only
  // presentation/three3d imports Three.js; any other import fails, naming the file and the import.
  it('is reported with the file and the import', () => {
    const violations = layerViolations({
      'presentation/phaser2d/scene.ts': "import Phaser from 'phaser';",
      'presentation/three3d/scene.ts':
        "import { Scene } from 'three';\nimport { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';",
      'presentation/ui/bar.ts': "import Phaser from 'phaser';",
      'app/main.ts': "import { Mesh } from 'three';",
    });
    expect(violations).toEqual([
      { file: 'presentation/ui/bar.ts', import: 'phaser', rule: 'phaser only in presentation/phaser2d' },
      { file: 'app/main.ts', import: 'three', rule: 'three only in presentation/three3d' },
    ]);
  });

  it('holds in src/', () => {
    expect(layerViolations(srcFiles).filter((v) => isEngineRule(v.rule))).toEqual([]);
  });
});
