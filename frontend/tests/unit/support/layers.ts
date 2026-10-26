/**
 * The layering checker behind the architecture spec's "Layered code" (docs/ARCHITECTURE.md,
 * section 2). It takes source files by their path under src/ and reports every import a file's
 * layer may not make, and every browser global used in domain/ or rules/. It has no
 * dependencies: TypeScript 7 has no compiler API to parse with, so imports are found in the
 * source text after comments are blanked out.
 */
import baseline from './layer-baseline.json';

export interface Violation {
  /** The importing file, relative to src/. */
  file: string;
  /** The specifier as written, or the browser global used. */
  import: string;
  rule: string;
}

/** Every TypeScript file under src/, keyed by its path relative to src/. */
export const srcFiles: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>(['/src/**/*.ts', '!/src/**/*.d.ts'], { query: '?raw', import: 'default', eager: true }),
  ).map(([path, source]) => [path.replace(/^\/src\//, ''), source]),
);

/** Known violations the real src/ may still have; each must still occur (a ratchet). */
export const knownViolations: readonly Violation[] = baseline;

type Layer = 'domain' | 'rules' | 'content' | 'assets' | 'services' | 'presentation' | 'phaser2d' | 'three3d' | 'app';

/** Layer -> the layers it may import (section 2, "Allowed imports"). */
const ALLOWED: Record<Layer, readonly Layer[] | 'all'> = {
  domain: ['domain'],
  rules: ['rules', 'domain'],
  content: ['content', 'domain'],
  assets: ['assets', 'domain'],
  services: ['services', 'domain'],
  presentation: ['presentation', 'domain', 'assets'],
  phaser2d: ['phaser2d', 'presentation', 'domain', 'assets'],
  three3d: ['three3d', 'presentation', 'domain', 'assets'],
  app: 'all',
};

/** Each renderer's engine, importable only from that renderer's own folder. */
const ENGINES: Record<string, Layer> = { phaser: 'phaser2d', three: 'three3d' };

const PURE: readonly Layer[] = ['domain', 'rules'];
const BROWSER_GLOBALS = ['document', 'window', 'localStorage', 'fetch', 'navigator'];

function layerOf(path: string): Layer | null {
  const [top, sub] = path.split('/');
  if (top === 'presentation') {
    if (sub === 'phaser2d' || sub === 'three3d') return sub;
    return 'presentation';
  }
  const layers: readonly string[] = ['domain', 'rules', 'content', 'assets', 'services', 'app'];
  return top !== undefined && layers.includes(top) ? (top as Layer) : null;
}

export function layerViolations(files: Record<string, string>): Violation[] {
  const violations: Violation[] = [];
  for (const [file, source] of Object.entries(files)) {
    const layer = layerOf(file);
    if (!layer) violations.push({ file, import: '', rule: 'every file is in a layer folder' });
    const { code, bare } = blank(source);
    for (const specifier of specifiers(code)) {
      const rule = importRule(file, layer, specifier);
      if (rule) violations.push({ file, import: specifier, rule });
    }
    if (layer && PURE.includes(layer)) {
      for (const global of globals(bare)) {
        violations.push({ file, import: global, rule: `${layer} uses no browser globals` });
      }
    }
  }
  return violations;
}

/** The violations not in the known list, and the known ones that no longer occur. */
export function againstBaseline(
  violations: readonly Violation[],
  known: readonly Violation[] = knownViolations,
): { unexpected: Violation[]; gone: Violation[] } {
  const same = (a: Violation) => (b: Violation) => a.file === b.file && a.import === b.import && a.rule === b.rule;
  return {
    unexpected: violations.filter((v) => !known.some(same(v))),
    gone: known.filter((k) => !violations.some(same(k))),
  };
}

export function isEngineRule(rule: string): boolean {
  return Object.keys(ENGINES).some((engine) => rule.startsWith(`${engine} only in `));
}

/** Why `file` may not import `specifier`, or null. A file outside the layers is checked for engines only. */
function importRule(file: string, layer: Layer | null, specifier: string): string | null {
  if (!specifier.startsWith('.')) {
    const engine = Object.keys(ENGINES).find((e) => specifier === e || specifier.startsWith(`${e}/`));
    if (engine && ENGINES[engine] !== layer) return `${engine} only in presentation/${ENGINES[engine]}`;
    return null;
  }
  if (!layer) return null;
  const target = resolve(file, specifier);
  const targetLayer = target === null ? null : layerOf(target);
  const allowed = ALLOWED[layer];
  if (allowed === 'all') return null;
  if (targetLayer === null) return `${layer} imports only from the layers`;
  if (!allowed.includes(targetLayer)) return `${layer} must not import ${targetLayer}`;
  return null;
}

/** A relative specifier resolved to a path under src/, or null when it leaves src/. */
function resolve(file: string, specifier: string): string | null {
  const parts = file.split('/').slice(0, -1);
  for (const part of specifier.split('/')) {
    if (part === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else if (part !== '.') parts.push(part);
  }
  return parts.join('/');
}

const FROM = /\b(?:import|export)\s+(?:type\s+)?[^'"`;]*?\bfrom\s*(['"])(.+?)\1/g;
const SIDE_EFFECT = /\bimport\s*(['"])(.+?)\1/g;
const DYNAMIC = /\bimport\s*\(\s*(['"`])(.+?)\1/g;
const GLOB = /\bimport\.meta\.glob\s*(?:<[^>]*>)?\s*\(\s*(\[[^\]]*\]|(['"`]).+?\2)/g;
const STRING = /(['"`])(.+?)\1/g;

function specifiers(code: string): string[] {
  const found: string[] = [];
  for (const pattern of [FROM, SIDE_EFFECT, DYNAMIC]) {
    for (const match of code.matchAll(pattern)) if (match[2] !== undefined) found.push(match[2]);
  }
  for (const match of code.matchAll(GLOB)) {
    for (const literal of (match[1] ?? '').matchAll(STRING)) {
      const pattern = (literal[2] ?? '').replace(/^!/, '');
      found.push(pattern.slice(0, pattern.search(/\/[^/]*\*|$/)) || '.');
    }
  }
  return found;
}

function globals(bare: string): string[] {
  const used = BROWSER_GLOBALS.filter((name) =>
    new RegExp(`(?<![\\w$.])(?:(?:globalThis|self|window)\\s*\\.\\s*)?${name}\\b(?!\\s*:)`).test(bare),
  );
  if (/\bimport\.meta\.env\b/.test(bare)) used.push('import.meta.env');
  return used;
}

/**
 * The source with comments blanked (`code`), and with comments and string contents blanked
 * (`bare`), so that neither a commented-out import nor a word in a string counts.
 */
function blank(source: string): { code: string; bare: string } {
  let code = '';
  let bare = '';
  let i = 0;
  const regexMayStart = () => /(^|[(,=:[!&|?{};]|\breturn)\s*$/.test(code.slice(-20));
  while (i < source.length) {
    const c = source[i] ?? '';
    const next = source[i + 1];
    let end: number;
    if (c === '/' && next === '/') {
      end = source.indexOf('\n', i);
      if (end === -1) end = source.length;
      const blanked = ' '.repeat(end - i);
      code += blanked;
      bare += blanked;
    } else if (c === '/' && next === '*') {
      end = source.indexOf('*/', i + 2);
      end = end === -1 ? source.length : end + 2;
      const blanked = source.slice(i, end).replace(/[^\n]/g, ' ');
      code += blanked;
      bare += blanked;
    } else if (c === "'" || c === '"' || c === '`' || (c === '/' && regexMayStart())) {
      end = i + 1;
      while (end < source.length && source[end] !== c && (c === '`' || source[end] !== '\n')) {
        end += source[end] === '\\' ? 2 : 1;
      }
      end = Math.min(end + 1, source.length);
      const literal = source.slice(i, end);
      code += literal;
      bare += c + literal.slice(1, -1).replace(/[^\n]/g, ' ') + c;
    } else {
      end = i + 1;
      code += c;
      bare += c;
    }
    i = end;
  }
  return { code, bare };
}
