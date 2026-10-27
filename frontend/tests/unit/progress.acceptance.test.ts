import { describe, expect, it } from 'vitest';
import { type ContentFiles, contentFiles, load, play } from './support/modules';

// Acceptance test for openspec/specs/progress/spec.md, requirement "Story as content". Content
// is bundled into the build, so the scenario adds its puzzle to the content files themselves.

type Json = Record<string, unknown>;

describe('Story as content', () => {
  // Requirement: Story as content. A puzzle added to the content data is playable without code
  // changes: a busker's hat that takes the broken guitar, and with it an act goal and a stat.
  it('Adding a puzzle', async () => {
    const [{ loadContent, validateContent }, { newGame }] = await Promise.all([load('content'), load('domain')]);
    const line = 'Someone will fix it for a coin.';
    const files: ContentFiles = structuredClone(contentFiles);
    ((files['content/rooms/opening.json'] as Json).hotspots as Json[]).push({
      id: 'test-hat',
      name: 'Busker hat',
      verb: 'Look at',
      target: { node: 'test-hat' },
      walkTo: { x: 600, y: 590 },
      interactions: [
        {
          verb: 'use',
          item: 'broken-guitar',
          effects: [{ say: line }, { take: 'broken-guitar' }, { changeStat: 'practice', by: 1 }, { reachGoal: 'fix-guitar' }],
        },
      ],
    });
    expect(validateContent(files)).toEqual([]);
    const content = loadContent(files);
    const { state, events } = await play(content, newGame(content), [
      { type: 'select', item: 'broken-guitar' },
      { type: 'activate', hotspot: 'test-hat' },
    ]);
    expect(events).toContainEqual(expect.objectContaining({ type: 'said', line }));
    expect(state.inventory.carried).not.toContain('broken-guitar');
    expect(state.stats.practice).toBe(1);
    expect(state.goals).toContain('fix-guitar');
  });
});
