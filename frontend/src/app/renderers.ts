import type { Registry } from '../assets/registry';
import type { Renderer } from '../presentation/renderer';

/**
 * The renderer that draws the game, with its model registry: the only place the app names one (docs/ARCHITECTURE.md).
 * It is its own chunk, so the title screen loads no engine.
 */
export async function createRenderer(registry: Registry): Promise<Renderer> {
  const { Three3dRenderer } = await import('../presentation/three3d/renderer');
  return new Three3dRenderer(registry);
}
