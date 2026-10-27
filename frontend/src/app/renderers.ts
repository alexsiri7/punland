import type { Renderer } from '../presentation/renderer';

/**
 * The renderer that draws the game: the only place the app names one. `?renderer=3d` picks the
 * 3D renderer, and anything else the 2D one, the default until B6 (docs/ARCHITECTURE.md). Each
 * is its own chunk, so the page loads only the engine it draws with.
 */
export async function createRenderer(search: string): Promise<Renderer> {
  if (new URLSearchParams(search).get('renderer') === '3d') {
    const { Three3dRenderer } = await import('../presentation/three3d/renderer');
    return new Three3dRenderer();
  }
  const { Phaser2dRenderer } = await import('../presentation/phaser2d/renderer');
  return new Phaser2dRenderer();
}
