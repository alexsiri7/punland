import { describe, expect, it } from 'vitest';
import { Inventory } from '../../src/presentation/phaser2d/inventory';

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

  it('restores what it saved, used-up items included', () => {
    const inventory = new Inventory(['broken-guitar']);
    inventory.pickUp('flyer');
    inventory.remove('flyer');
    const restored = Inventory.restore(JSON.parse(JSON.stringify(inventory.snapshot())));
    expect(restored.items).toEqual(['broken-guitar']);
    expect(restored.wasPickedUp('flyer')).toBe(true);
  });
});
