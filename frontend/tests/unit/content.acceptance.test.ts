import { describe, expect, it } from 'vitest';
import { type ContentFiles, contentFiles, load, play } from './support/modules';

// Acceptance tests for openspec/specs/architecture/spec.md, requirements "Validated content"
// and "Interactions as data". Interactions, conditions and effects are in
// docs/ARCHITECTURE.md, section 4.

type Json = Record<string, unknown>;

/** A copy of the real content files, with `edit` applied to the parsed file at `path`. */
function withEdit(path: string, edit: (file: Json) => void): ContentFiles {
  const files = structuredClone(contentFiles);
  edit(files[path] as Json);
  return files;
}

describe('Validated content', () => {
  // Requirement: Validated content. Content data is checked against its schema, and content
  // that does not hold together is reported with the file and the field.
  it('A broken content file', async () => {
    const { validateContent } = await load('content');
    expect(validateContent(contentFiles)).toEqual([]);

    const noWorld = withEdit('content/rooms/opening.json', (room) => delete room.world);
    expect(validateContent(noWorld)).toContainEqual(
      expect.objectContaining({ file: 'content/rooms/opening.json', field: expect.stringMatching(/world/) }),
    );

    const unknownRoom = withEdit('content/worlds.json', (file) => {
      (file.worlds as Json[])[0]!.start = 'no-such-room';
    });
    expect(validateContent(unknownRoom)).toContainEqual(
      expect.objectContaining({ file: 'content/worlds.json', field: expect.stringMatching(/start/) }),
    );

    const unknownItem = withEdit('content/items.json', (file) => {
      file.start = ['no-such-item'];
    });
    expect(validateContent(unknownItem)).toContainEqual(
      expect.objectContaining({ file: 'content/items.json', field: expect.stringMatching(/start/) }),
    );
  });
});

describe('Interactions as data', () => {
  // Requirement: Interactions as data. What a hotspot does is content data, so a new puzzle step
  // with effects the rules already know needs no code change.
  it.fails('Adding a puzzle step (needs #33)', async () => {
    const [{ loadContent, validateContent }, { newGame }] = await Promise.all([load('content'), load('domain')]);
    const line = 'I hold the guitar up to the board. Still no slot for broken instruments.';
    const files = withEdit('content/rooms/opening.json', (room) => {
      const board = (room.hotspots as Json[]).find((hotspot) => hotspot.id === 'board')!;
      (board.interactions as Json[]).push({ verb: 'use', item: 'broken-guitar', effects: [{ say: line }] });
    });
    expect(validateContent(files)).toEqual([]);
    const content = loadContent(files);
    const { events } = await play(content, newGame(content), [
      { type: 'select', item: 'broken-guitar' },
      { type: 'activate', hotspot: 'board' },
    ]);
    expect(events).toContainEqual(expect.objectContaining({ type: 'said', line }));
  });
});
