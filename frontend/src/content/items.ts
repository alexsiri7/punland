import type { Item } from '../domain/content';
import content from './items.json';

/**
 * Items as content data (progress spec, "Story as content"): ./items.json names every item
 * and the starting inventory. An item's icon is public/items/<id>.svg. Where an item can be
 * picked up, and what it does when used on a hotspot, is room content (./rooms.ts).
 */
export type { Item } from '../domain/content';

export const items: Record<string, Item> = content.items;

/** What a new game starts with (inventory spec, "Starting inventory"). */
export const START_ITEMS: readonly string[] = content.start;
