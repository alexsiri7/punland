import type { Point } from './content/rooms';
import type { World } from './content/worlds';

export interface Place {
  room: string;
  at?: Point;
}

/**
 * Where the player has been in each world, and the dream material the street has given, for
 * one play session: handed from room to room in the scene data, like the inventory.
 * Saving it is #10's job.
 */
export class Journey {
  private left = new Map<string, Place>();
  private material = new Set<string>();

  /** Remembers where the player left a world, to come back to the same spot. */
  leave(world: string, place: Place): void {
    this.left.set(world, { room: place.room, at: place.at && { ...place.at } });
  }

  /** Where the player comes into a world: where they left it, else its start room. */
  enter(world: World): Place {
    return this.left.get(world.id) ?? { room: world.start };
  }

  gather(material: string): void {
    this.material.add(material);
  }

  hasGathered(material: string): boolean {
    return this.material.has(material);
  }
}
