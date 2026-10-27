import { Phaser2dRenderer } from '../presentation/phaser2d/renderer';
import type { Renderer } from '../presentation/renderer';

/** The renderer that draws the game: the only place the app names one. The 3D renderer (B2) adds `?renderer=3d`. */
export function createRenderer(): Renderer {
  return new Phaser2dRenderer();
}
