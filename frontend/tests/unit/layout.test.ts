import { describe, expect, it } from 'vitest';
import { addCorner, handlesOf, layoutOf, moveHandle, pointAt, removeCorner, sameLayout } from '../../src/domain';
import { content } from './fixtures/content';

// A room's layout: the points of its file the owner's editor moves (editor spec, "Edit mode").

describe('a room layout', () => {
  const street = layoutOf(content.rooms.street!);

  it('has the start, the floor corners, each walk-to point and each placed entity\'s spot', () => {
    expect(street.start).toEqual({ x: 100, y: 550 });
    expect(street.walkable).toHaveLength(4);
    expect(street.hotspots.flyer).toEqual({ walkTo: { x: 200, y: 550 }, at: { x: 200, y: 520 } });
    expect(street.hotspots.door).toEqual({ walkTo: { x: 500, y: 550 } });
    expect(handlesOf(street).map(({ handle }) => handle)).toContainEqual({ kind: 'spot', hotspot: 'flyer' });
    expect(handlesOf(street).map(({ handle }) => handle)).not.toContainEqual({ kind: 'spot', hotspot: 'door' });
  });

  it('moves one point, to whole scene pixels', () => {
    const moved = moveHandle(street, { kind: 'spot', hotspot: 'flyer' }, { x: 250.6, y: 530.2 });
    expect(pointAt(moved, { kind: 'spot', hotspot: 'flyer' })).toEqual({ x: 251, y: 530 });
    expect(moved.hotspots.flyer?.walkTo).toEqual({ x: 200, y: 550 });
    expect(sameLayout(moved, street)).toBe(false);
    expect(sameLayout(moveHandle(moved, { kind: 'spot', hotspot: 'flyer' }, { x: 200, y: 520 }), street)).toBe(true);
  });

  it('has no spot to move for a part of the scene', () => {
    expect(moveHandle(street, { kind: 'spot', hotspot: 'door' }, { x: 1, y: 1 })).toBe(street);
  });

  it('adds a floor corner halfway along an edge, and removes one down to three', () => {
    const added = addCorner(street, 0);
    expect(added.walkable[1]).toEqual({ x: 500, y: 500 });
    expect(added.walkable).toHaveLength(5);
    const closing = addCorner(street, street.walkable.length - 1);
    expect(closing.walkable).toEqual([...street.walkable, { x: 0, y: 550 }]);
    const three = removeCorner(street, 3);
    expect(three.walkable).toEqual(street.walkable.slice(0, 3));
    expect(removeCorner(three, 0)).toBe(three);
  });
});
