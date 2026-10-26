/** An inventory as it is saved: the carried items, and every item ever picked up. */
export interface InventoryState {
  items: string[];
  pickedUp: string[];
}
