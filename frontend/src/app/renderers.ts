import type { Renderer } from '../presentation/renderer';

/**
 * The renderer that draws the game: the only place the app names one. The 3D renderer is the
 * default, and `?renderer=2d` picks the 2D one, a fallback until B7 (docs/ARCHITECTURE.md). Each
 * is its own chunk, so the page loads only the engine it draws with.
 */
export async function createRenderer(search: string): Promise<Renderer> {
  if (new URLSearchParams(search).get('renderer') === '2d') {
    const { Phaser2dRenderer } = await import('../presentation/phaser2d/renderer');
    return new Phaser2dRenderer();
  }
  const { Three3dRenderer } = await import('../presentation/three3d/renderer');
  return new Three3dRenderer();
}
