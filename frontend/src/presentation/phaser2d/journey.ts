import type { JourneyState, Place } from '../../domain/journey';

/**
 * Where the player has been in each world, and the dream material the street has given, for
 * one play session: handed from room to room in the scene data, like the inventory, and saved
 * through snapshot().
 */
export class Journey {
  private left = new Map<string, Place>();
  private material = new Set<string>();

  static restore(state: JourneyState): Journey {
    const journey = new Journey();
    for (const [world, place] of Object.entries(state.left)) journey.leave(world, place);
    journey.material = new Set(state.gathered);
    return journey;
  }

  snapshot(): JourneyState {
    const left: Record<string, Place> = {};
    for (const [world, place] of this.left) left[world] = copy(place);
    return { left, gathered: [...this.material] };
  }

  /** Remembers where the player left a world, to come back to the same spot. */
  leave(world: string, place: Place): void {
    this.left.set(world, copy(place));
  }

  /** Where the player comes into a world: where they left it, else its start room. */
  enter(world: { id: string; start: string }): Place {
    return this.left.get(world.id) ?? { room: world.start };
  }

  gather(material: string): void {
    this.material.add(material);
  }

  hasGathered(material: string): boolean {
    return this.material.has(material);
  }
}

function copy(place: Place): Place {
  return place.at ? { room: place.room, at: { ...place.at } } : { room: place.room };
}
