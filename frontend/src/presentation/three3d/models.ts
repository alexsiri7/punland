import { type Material, Mesh, MeshStandardMaterial, MeshToonMaterial, type Object3D } from 'three';
import { type GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { model3dFile } from '../../assets/registry';
import type { ModelId } from '../../domain';
import { toonMaterial } from './look';

/**
 * The registry's glb files (model3d.file), each loaded once and drawn with the toon look: every
 * material's base colour on a MeshToonMaterial (docs/ARCHITECTURE.md, section 7).
 */
export class Models {
  private readonly loader = new GLTFLoader();
  private readonly loaded = new Map<ModelId, Promise<Object3D>>();

  /**
   * A new copy of the model to place, or null when it has no 3D variant or its file failed to
   * load: one missing model leaves the rest of the room standing, and the next room tries again.
   */
  async instance(model: ModelId): Promise<Object3D | null> {
    const file = model3dFile(model);
    if (file === null) return null;
    let template = this.loaded.get(model);
    if (!template) {
      template = this.loader.loadAsync(file).then(toonScene);
      this.loaded.set(model, template);
    }
    try {
      return clone(await template);
    } catch (error) {
      if (this.loaded.get(model) === template) this.loaded.delete(model);
      console.warn(`Couldn't load ${file}:`, error);
      return null;
    }
  }
}

function toonScene(gltf: GLTF): Object3D {
  gltf.scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials: Material | Material[] = object.material;
    object.material = Array.isArray(materials) ? materials.map(toon) : toon(materials);
    object.castShadow = true;
  });
  return gltf.scene;
}

/** The asset contract gives each part its base colour only; the toon ramp makes the shade. */
function toon(material: Material): MeshToonMaterial {
  const toonish = toonMaterial(material instanceof MeshStandardMaterial ? material.color : undefined);
  toonish.name = material.name;
  material.dispose();
  return toonish;
}
