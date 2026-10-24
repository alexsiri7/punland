import content from './items.json';

/**
 * Items as content data (progress spec, "Story as content"): ./items.json names every item
 * and the starting inventory. An item's icon is public/items/<id>.svg. Where an item can be
 * picked up, and what it does when used on a hotspot, is room content (./rooms.ts).
 */
export interface Item {
  /** Accessible name, shown on hover. */
  name: string;
  /** What the cat says on using the item on a hotspot that doesn't accept it. */
  noUse: string;
}

export const items: Record<string, Item> = content.items;

/** What a new game starts with (inventory spec, "Starting inventory"). */
export const START_ITEMS: readonly string[] = content.start;
