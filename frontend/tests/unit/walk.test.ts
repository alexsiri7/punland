import { describe, expect, it } from 'vitest';
import { insidePolygon, isConvex, nearestWalkable } from '../../src/domain/geometry';

const floor = [
  { x: 100, y: 500 },
  { x: 900, y: 500 },
  { x: 900, y: 600 },
  { x: 100, y: 600 },
];

describe('insidePolygon', () => {
  it('is true inside, false outside, and true on the edge', () => {
    expect(insidePolygon({ x: 500, y: 550 }, floor)).toBe(true);
    expect(insidePolygon({ x: 500, y: 300 }, floor)).toBe(false);
    expect(insidePolygon({ x: 950, y: 550 }, floor)).toBe(false);
    expect(insidePolygon({ x: 500, y: 500 }, floor)).toBe(true);
    expect(insidePolygon({ x: 100, y: 600 }, floor)).toBe(true);
  });
});

describe('isConvex', () => {
  it('takes a corner on a straight edge, and refuses a dent or fewer than three corners', () => {
    expect(isConvex(floor)).toBe(true);
    expect(isConvex([...floor.slice(0, 2), { x: 900, y: 550 }, ...floor.slice(2)])).toBe(true);
    expect(isConvex([...floor.slice(0, 2), { x: 500, y: 550 }, ...floor.slice(2)])).toBe(false);
    expect(isConvex(floor.slice(0, 2))).toBe(false);
  });
});

describe('nearestWalkable', () => {
  it('keeps a point on the floor', () => {
    expect(nearestWalkable({ x: 420, y: 560 }, floor)).toEqual({ x: 420, y: 560 });
  });

  it('moves a point off the floor to the closest point of its edge', () => {
    expect(nearestWalkable({ x: 420, y: 300 }, floor)).toEqual({ x: 420, y: 500 });
    expect(nearestWalkable({ x: 20, y: 560 }, floor)).toEqual({ x: 100, y: 560 });
    expect(nearestWalkable({ x: 0, y: 0 }, floor)).toEqual({ x: 100, y: 500 });
  });
});
