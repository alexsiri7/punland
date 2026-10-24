/**
 * The protagonist. The single place his name lives in code: renaming him is a
 * one-line change here.
 *
 * PLACEHOLDER: "Paws Anka" (a pun on Paul Anka) was picked by the owner on
 * 2026-10-24 as a working name and may change. Don't build puns, puzzles or
 * dialogue that depend on this exact name. See docs/design/STYLE.md.
 */
export const PROTAGONIST = {
  name: 'Paws Anka',
  placeholderName: true,
  /** The id of his <g> in each room's layer-actors (art/<room>/scene.svg): the sprite the player moves. */
  actor: 'cat',
} as const;
