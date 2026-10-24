import { describe, expect, it } from 'vitest';
import type { World } from '../../src/content/worlds';
import { Journey } from '../../src/journey';

const street: World = { id: 'street', name: 'Street', start: 'opening' };
const dream: World = { id: 'dream', name: 'Dream', start: 'dream' };

describe('Journey', () => {
  it('enters a world the player has not been to at its start room', () => {
    expect(new Journey().enter(street)).toEqual({ room: 'opening' });
  });

  it('brings the player back to the room and spot they left a world at', () => {
    const journey = new Journey();
    const at = { x: 10, y: 20 };
    journey.leave('street', { room: 'pub', at });
    at.x = 99;
    expect(journey.enter(dream)).toEqual({ room: 'dream' });
    expect(journey.enter(street)).toEqual({ room: 'pub', at: { x: 10, y: 20 } });
  });
});
