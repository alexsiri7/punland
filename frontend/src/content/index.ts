import type { Content } from '../domain/content';
import { type ContentFiles, readContent } from './validate';

export type { ContentFiles, ContentIssue } from './validate';
export { validateContent } from './validate';

/**
 * The content files here (worlds.json, items.json, characters.json, objects.json, stats.json,
 * acts.json and rooms/<room>.json), by their path under src/.
 */
const files: ContentFiles = Object.fromEntries(
  Object.entries(import.meta.glob('./**/*.json', { eager: true, import: 'default' })).map(([path, data]) => [
    path.replace(/^\.\//, 'content/'),
    data,
  ]),
);

/**
 * The worlds, rooms, items, characters, objects, stats and acts, checked: the real content files, or `given` in their place.
 * Content that doesn't hold together throws, listing every problem by file and field.
 */
export function loadContent(given: ContentFiles = files): Content {
  const { content, issues } = readContent(given);
  if (content) return content;
  const problems = issues.map(({ file, field, message }) => `  ${file}${field ? ` ${field}` : ''}: ${message}`);
  throw new Error(`The content doesn't hold together:\n${problems.join('\n')}`);
}
