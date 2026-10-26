/**
 * Tune Story design tokens (docs/design/STYLE.md). Scenes and UI take their colours
 * and fonts from here, never from ad-hoc hex values.
 */
export const palette = {
  // Sky
  duskBlue: '#2E3A52',
  hazeViolet: '#6E6478',
  horizonClay: '#C98A6C',
  // Light
  windowGlow: '#E8B566',
  bulb: '#FFE3A0',
  signGold: '#E3C58A',
  lampAmber: '#C99A54',
  // Ink & UI
  uiGround: '#1C1D22',
  slot: '#26272E',
  slotEdge: '#3A3C46',
  divider: '#34363F',
  uiText: '#E8E4DC',
  mutedText: '#A9A6B2',
  labelText: '#8E8B98',
  castShadow: '#141218',
} as const;

export const fonts = {
  ui: 'Inter, system-ui, sans-serif',
  sign: '"Bebas Neue", Impact, sans-serif',
} as const;

/** Scene art is 1280 x 640; the UI bar sits under it (STYLE.md, UI bar). */
export const SCENE_WIDTH = 1280;
export const SCENE_HEIGHT = 640;
export const UI_BAR_HEIGHT = 160;
