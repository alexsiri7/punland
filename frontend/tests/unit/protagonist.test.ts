import { describe, expect, it } from 'vitest';
import { PROTAGONIST } from '../../src/content/protagonist';

describe('protagonist', () => {
  it('has the placeholder name Paws Anka, flagged as a placeholder', () => {
    expect(PROTAGONIST.name).toBe('Paws Anka');
    expect(PROTAGONIST.placeholderName).toBe(true);
  });
});
