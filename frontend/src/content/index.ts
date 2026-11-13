import type { Content } from '../domain/content';
import type { RoomLayout } from '../domain/layout';
import { type ContentFiles, type ContentResult, readContent } from './validate';

export type { ContentFiles, ContentIssue, ContentResult } from './validate';
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

/**
 * The content with the owner's edited room layouts written into their room files (editor spec),
 * read by the same validator as the files themselves: the content, or every problem the edits make.
 */
export function contentWithLayouts(
  layouts: Readonly<Record<string, RoomLayout>>,
  given: ContentFiles = files,
): ContentResult {
  const edited: Record<string, unknown> = { ...given };
  for (const [room, layout] of Object.entries(layouts)) {
    const path = `content/rooms/${room}.json`;
    if (Object.hasOwn(given, path)) edited[path] = withLayout(given[path], layout);
  }
  return readContent(edited);
}

/** A copy of a room file with a layout's points in it; the validator reports whatever else is wrong. */
function withLayout(file: unknown, layout: RoomLayout): unknown {
  if (!isRecord(file)) return file;
  const hotspots = Array.isArray(file.hotspots)
    ? file.hotspots.map((hotspot: unknown) => {
        if (!isRecord(hotspot) || typeof hotspot.id !== 'string') return hotspot;
        const moved = Object.hasOwn(layout.hotspots, hotspot.id) ? layout.hotspots[hotspot.id] : undefined;
        if (!moved) return hotspot;
        const { target } = hotspot;
        const at = moved.at && isRecord(target) && 'at' in target ? { target: { ...target, at: moved.at } } : {};
        return { ...hotspot, walkTo: moved.walkTo, ...at };
      })
    : file.hotspots;
  return { ...file, start: layout.start, walkable: layout.walkable, hotspots };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
