import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content';

// Items are content data: adding one must not need a code change. The content validator checks
// the item file (content.test.ts); this checks each item has its icon (progress spec, "Story as content").

const icons = import.meta.glob('../../public/items/*.svg', { eager: true, query: '?raw', import: 'default' });
const { items, start } = loadContent();

describe('item content', () => {
  it('starts a new game with the broken guitar', () => {
    expect(start.items).toContain('broken-guitar');
  });

  it.each(Object.keys(items))('has an icon for %s', (id) => {
    expect(Object.keys(icons)).toContain(`../../public/items/${id}.svg`);
  });
});
