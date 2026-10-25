import type { InventoryState } from '../../domain/inventory';

/**
 * The inventory for one play session, handed from room to room in the scene data, and saved
 * through snapshot().
 */
export class Inventory {
  selected: string | null = null;
  private carried: string[];
  private picked = new Set<string>();

  constructor(start: readonly string[]) {
    this.carried = [...start];
  }

  static restore(state: InventoryState): Inventory {
    const inventory = new Inventory(state.items);
    inventory.picked = new Set(state.pickedUp);
    return inventory;
  }

  snapshot(): InventoryState {
    return { items: [...this.carried], pickedUp: [...this.picked] };
  }

  /** The carried item ids, in the order they came. */
  get items(): readonly string[] {
    return this.carried;
  }

  has(id: string): boolean {
    return this.carried.includes(id);
  }

  pickUp(id: string): void {
    if (!this.has(id)) this.carried.push(id);
    this.picked.add(id);
  }

  /** Stays true once the item is used up, so it never comes back to the room. */
  wasPickedUp(id: string): boolean {
    return this.picked.has(id);
  }

  remove(id: string): void {
    this.carried = this.carried.filter((item) => item !== id);
    if (this.selected === id) this.selected = null;
  }

  select(id: string | null): void {
    this.selected = id;
  }
}
