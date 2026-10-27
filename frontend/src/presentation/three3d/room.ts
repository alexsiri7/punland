import { Box3, Color, Mesh, type Object3D, PerspectiveCamera, Raycaster, Scene, Vector2, Vector3 } from 'three';
import type { FloorPoint, Rect } from '../../domain';
import type { ScenePoint, SceneView } from '../renderer';
import { palette, SCENE_HEIGHT, SCENE_WIDTH } from '../theme';
import { light } from './look';
import type { Models } from './models';

/**
 * One SceneView in 3D: the room's scene model seen by its `cam_main`, with the player and the
 * placed entities standing on its `floor`. Content's floor points are where rays from the camera
 * through those scene pixels meet the floor (docs/ARCHITECTURE.md, section 7), which the asset
 * validator checks for every room. A room whose scene model fails to load is the empty dusk sky.
 */
export class Room {
  readonly scene = new Scene();
  readonly sky = new Color(palette.duskBlue);
  readonly camera: PerspectiveCamera;
  private readonly raycaster = new Raycaster();
  private readonly floorMesh: Object3D | null;
  private player: Object3D | null = null;
  /** What each hotspot is drawn as: the model it places, or its scene model's `hit_<node>`. */
  private readonly hotspots = new Map<string, Object3D>();
  /** The models of the hotspots that place an entity, by hotspot id. */
  private readonly entities = new Map<string, Object3D>();
  /** The hotspots that are not in the room now: they are not drawn or picked. */
  private readonly hidden = new Set<string>();

  private constructor(model: Object3D | null) {
    const camera = model?.getObjectByName('cam_main');
    this.camera = camera instanceof PerspectiveCamera ? camera : new PerspectiveCamera();
    this.camera.aspect = SCENE_WIDTH / SCENE_HEIGHT;
    this.camera.updateProjectionMatrix();
    this.floorMesh = model?.getObjectByName('floor') ?? null;
    if (model) {
      model.traverse((object) => {
        if (object instanceof Mesh) object.receiveShadow = true;
      });
      this.scene.add(model);
    }
    this.scene.updateMatrixWorld(true);
    light(this.scene);
  }

  /** Loads the view's models and stands them on the floor, the player facing the camera. */
  static async build(view: SceneView, models: Models): Promise<Room> {
    const [scene, player, ...entities] = await Promise.all([
      models.instance(view.model),
      models.instance(view.player.model),
      ...view.entities.map((e) => (e.model === undefined ? null : models.instance(e.model))),
    ]);
    const room = new Room(scene);
    if (player) {
      room.player = player;
      room.scene.add(player);
      room.stand(player, view.player.at);
    }
    view.entities.forEach((entity, i) => {
      if (!entity.visible) room.hidden.add(entity.hotspot);
      if (entity.model === undefined) {
        const hit = scene?.getObjectByName(`hit_${entity.node}`);
        if (hit) room.hotspots.set(entity.hotspot, hit);
        return;
      }
      const object = entities[i];
      if (!object) return;
      room.stand(object, entity.at);
      object.visible = entity.visible;
      room.entities.set(entity.hotspot, object);
      room.hotspots.set(entity.hotspot, object);
      room.scene.add(object);
    });
    return room;
  }

  /** Stands the player at a floor point, turned the way they moved to get there. */
  placePlayer(at: FloorPoint): void {
    if (!this.player) return;
    const from = this.player.position.clone();
    if (!this.stand(this.player, at)) return;
    const step = this.player.position.clone().sub(from);
    if (step.lengthSq() > 1e-8) this.player.rotation.y = Math.atan2(step.x, step.z);
  }

  setVisible(hotspot: string, visible: boolean): void {
    if (visible) this.hidden.delete(hotspot);
    else this.hidden.add(hotspot);
    const entity = this.entities.get(hotspot);
    if (entity) entity.visible = visible;
  }

  /** Whether a point of the scene is on the floor. */
  isFloor(screen: ScenePoint): boolean {
    return this.floor(screen) !== null;
  }

  /** The hotspot in the room whose hit area is nearest the camera at a point of the scene, if any. */
  hotspotAt(screen: ScenePoint): string | null {
    this.aim(screen);
    let nearest: { hotspot: string; distance: number } | null = null;
    for (const [hotspot, object] of this.hotspots) {
      if (this.hidden.has(hotspot)) continue;
      const hit = this.raycaster.intersectObjects(this.hitArea(hotspot, object), true)[0];
      if (hit && (!nearest || hit.distance < nearest.distance)) nearest = { hotspot, distance: hit.distance };
    }
    return nearest?.hotspot ?? null;
  }

  /** The projected bounds of what a hotspot is drawn as, or null if the room draws it as nothing. */
  hotspotBounds(hotspot: string): Rect | null {
    const object = this.hotspots.get(hotspot);
    if (!object) return null;
    object.updateMatrixWorld(true);
    const box = new Box3().setFromObject(object);
    if (box.isEmpty()) return null;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          const at = this.toScene(new Vector3(x, y, z));
          xs.push(at.x);
          ys.push(at.y);
        }
      }
    }
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return { x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
  }

  /** Where a model's `anchor_<name>` node is in the scene, if it has one. */
  anchor(who: string, name: 'head' | 'hand_r'): ScenePoint | null {
    const model = who === 'player' ? this.player : this.entities.get(who);
    const node = model?.getObjectByName(`anchor_${name}`);
    return node ? this.toScene(node.getWorldPosition(new Vector3())) : null;
  }

  /**
   * What a ray has to meet to pick a hotspot: a part of the scene's `hit_<node>`, or an entity's
   * `hit` proxy if its model has one (asset contract), else its visible meshes.
   */
  private hitArea(hotspot: string, object: Object3D): Object3D[] {
    if (!this.entities.has(hotspot)) return [object];
    const proxy = object.getObjectByName('hit');
    if (proxy) return [proxy];
    const meshes: Object3D[] = [];
    object.traverseVisible((child) => {
      if (child instanceof Mesh) meshes.push(child);
    });
    return meshes;
  }

  private stand(object: Object3D, at: FloorPoint): boolean {
    const world = this.floor(at);
    if (world) object.position.copy(world);
    return world !== null;
  }

  /** The floor under a point of the scene, or null where the camera sees no floor. */
  private floor(screen: ScenePoint): Vector3 | null {
    if (!this.floorMesh) return null;
    this.aim(screen);
    return this.raycaster.intersectObject(this.floorMesh)[0]?.point ?? null;
  }

  /** Points the raycaster from the camera through a point of the scene. */
  private aim(screen: ScenePoint): void {
    const ndc = new Vector2((screen.x / SCENE_WIDTH) * 2 - 1, 1 - (screen.y / SCENE_HEIGHT) * 2);
    this.raycaster.setFromCamera(ndc, this.camera);
  }

  private toScene(world: Vector3): ScenePoint {
    const ndc = world.project(this.camera);
    return { x: ((ndc.x + 1) / 2) * SCENE_WIDTH, y: ((1 - ndc.y) / 2) * SCENE_HEIGHT };
  }
}
