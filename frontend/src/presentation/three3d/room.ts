import {
  Box3,
  Color,
  Mesh,
  type Object3D,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
} from 'three';
import type { FloorPoint, Rect } from '../../domain';
import type { ScenePoint, SceneView } from '../renderer';
import { palette, SCENE_HEIGHT, SCENE_WIDTH } from '../theme';
import { light, toonMaterial } from './look';
import type { Models } from './models';

/** The ground: content's floor points are where rays through those scene pixels meet it. */
const GROUND = new Plane(new Vector3(0, 1, 0), 0);

/**
 * One SceneView in 3D: the player and the placed entities on the floor, seen by the room's camera.
 * Until the scene models of B3 bring their `cam_main` and room shell, every room is the same
 * default room: a ground plane under the dusk sky, and a camera that frames the protagonist about
 * 256 px tall at the front of the walk line (asset contract, "Scale") with the horizon well above
 * every room's floor polygon, so all of the 2D floor points land on the ground.
 */
export class Room {
  readonly scene = new Scene();
  readonly sky = new Color(palette.duskBlue);
  readonly camera = new PerspectiveCamera(25, SCENE_WIDTH / SCENE_HEIGHT, 0.1, 200);
  private readonly raycaster = new Raycaster();
  private readonly ground = new Mesh(new PlaneGeometry(200, 200), toonMaterial(palette.pavement));
  private player: Object3D | null = null;
  /** The models of the hotspots that place an entity, by hotspot id. */
  private readonly entities = new Map<string, Object3D>();

  private constructor() {
    // The origin is at the front centre of the walkable area, as in a scene model (asset contract).
    this.camera.position.set(0, 2.5, 9);
    this.camera.rotation.x = (-6 * Math.PI) / 180;
    this.camera.updateMatrixWorld();
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    light(this.scene);
  }

  /** Loads the view's models and stands them on the floor, the player facing the camera. */
  static async build(view: SceneView, models: Models): Promise<Room> {
    const room = new Room();
    const [player, ...entities] = await Promise.all([
      models.instance(view.player.model),
      ...view.entities.map((e) => (e.model === undefined ? null : models.instance(e.model))),
    ]);
    if (player) {
      room.player = player;
      room.scene.add(player);
      room.stand(player, view.player.at);
    }
    view.entities.forEach((entity, i) => {
      const object = entities[i];
      if (!object || entity.model === undefined) return;
      room.stand(object, entity.at);
      object.visible = entity.visible;
      room.entities.set(entity.hotspot, object);
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
    const entity = this.entities.get(hotspot);
    if (entity) entity.visible = visible;
  }

  /** Whether a point of the scene is on the floor. */
  isFloor(screen: ScenePoint): boolean {
    return this.floor(screen) !== null;
  }

  /** The projected bounds of a placed entity's model, or null for a hotspot that places none. */
  entityBounds(hotspot: string): Rect | null {
    const entity = this.entities.get(hotspot);
    if (!entity) return null;
    entity.updateMatrixWorld(true);
    const box = new Box3().setFromObject(entity);
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

  /** Frees the room's own ground; the models' geometry and materials are shared with their cached copies. */
  dispose(): void {
    this.ground.geometry.dispose();
    this.ground.material.dispose();
  }

  private stand(object: Object3D, at: FloorPoint): boolean {
    const world = this.floor(at);
    if (world) object.position.copy(world);
    return world !== null;
  }

  /** The ground under a point of the scene, or null above the horizon. */
  private floor(screen: ScenePoint): Vector3 | null {
    const ndc = new Vector2((screen.x / SCENE_WIDTH) * 2 - 1, 1 - (screen.y / SCENE_HEIGHT) * 2);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.ray.intersectPlane(GROUND, new Vector3());
  }

  private toScene(world: Vector3): ScenePoint {
    const ndc = world.project(this.camera);
    return { x: ((ndc.x + 1) / 2) * SCENE_WIDTH, y: ((1 - ndc.y) / 2) * SCENE_HEIGHT };
  }
}
