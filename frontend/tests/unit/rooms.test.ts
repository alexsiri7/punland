import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content';

// Rooms are content data: adding one must not need a code change. The content validator checks
// that every room file holds together (content.test.ts), and the asset validator each room's
// models against their art (assets.test.ts).

describe('room content', () => {
  it('starts a new game outside The Three Crows', () => {
    expect(loadContent().start.room).toBe('opening');
  });
});
