import { describe, expect, it } from 'vitest';
import { Inventory } from '../../src/inventory';

describe('Inventory', () => {
  it('remembers a used-up item was picked up, so it never comes back to its room', () => {
    const inventory = new Inventory([]);
    inventory.pickUp('flyer');
    inventory.select('flyer');
    inventory.remove('flyer');
    expect(inventory.has('flyer')).toBe(false);
    expect(inventory.selected).toBeNull();
    expect(inventory.wasPickedUp('flyer')).toBe(true);
  });
});
