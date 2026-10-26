import { describe, expect, it } from 'vitest';
import { items, START_ITEMS } from '../../src/content/items';

// Items are content data: adding one must not need a code change, so this checks that the
// item file holds together (progress spec, "Story as content").

const icons = import.meta.glob('../../public/items/*.svg', { eager: true, query: '?raw', import: 'default' });

describe('item content', () => {
  it('starts a new game with the broken guitar', () => {
    expect(START_ITEMS).toContain('broken-guitar');
    for (const id of START_ITEMS) expect(Object.keys(items)).toContain(id);
  });

  describe.each(Object.entries(items))('%s', (id, item) => {
    it('has a name and a line for a use that does not work', () => {
      expect(item.name).toMatch(/\S/);
      expect(item.noUse).toMatch(/\S/);
    });

    it('has an icon', () => {
      expect(Object.keys(icons)).toContain(`../../public/items/${id}.svg`);
    });
  });
});
