import Phaser from 'phaser';
import { actorOf, type SceneSprite, sceneSprite } from '../../assets/registry';
import type { FloorPoint } from '../../domain';
import type { SceneView } from '../renderer';

/** public/rooms/<room>/art.json, written by scripts/render-art.mjs from art/<room>/scene.svg. */
interface RoomArt {
  room: string;
  width: number;
  height: number;
  scale: number;
  layers: { key: string; file: string; x: number; y: number; depth: number; actor?: string; foot?: FloorPoint }[];
}

/** The view to draw. */
export interface RoomData {
  view: SceneView;
}

/**
 * Draws one SceneView from the room's art (public/rooms/<room>/: swappable layer files), as the
 * model registry has it: the scene model's layers, with the player's and the placed entities'
 * sprites found by their models' actors. Nothing here is specific to a room, and nothing here
 * is a game rule or takes input.
 */
export class RoomScene extends Phaser.Scene {
  static readonly KEY = 'room';

  private view!: SceneView;
  private player: Phaser.GameObjects.Image | null = null;
  /** Room sprites of hotspots, by hotspot id. */
  private sprites = new Map<string, Phaser.GameObjects.Image>();

  /** `drawn` is called once the view is drawn. */
  constructor(private readonly drawn: (view: SceneView) => void) {
    super(RoomScene.KEY);
  }

  init(data: RoomData): void {
    this.view = data.view;
    this.player = null;
    this.sprites = new Map();
  }

  preload(): void {
    const artKey = this.artKey();
    const { layers } = this.sprite();
    const base = layers.slice(0, layers.lastIndexOf('/') + 1);
    const loadLayers = (art: RoomArt) => {
      for (const layer of art.layers) {
        if (!this.textures.exists(layer.key)) this.load.image(layer.key, `${base}${layer.file}`);
      }
    };
    if (this.cache.json.exists(artKey)) {
      loadLayers(this.cache.json.get(artKey) as RoomArt);
      return;
    }
    this.load.json(artKey, layers);
    this.load.once(`filecomplete-json-${artKey}`, (_key: string, _type: string, art: RoomArt) => loadLayers(art));
  }

  create(): void {
    const art = this.cache.json.get(this.artKey()) as RoomArt;
    const player = actorOf(this.view.player.model);
    for (const layer of art.layers) {
      const image = this.add
        .image(layer.x, layer.y, layer.key)
        .setOrigin(0)
        .setScale(1 / art.scale)
        .setDepth(layer.depth);
      if (!layer.actor) continue;
      if (layer.actor === player) {
        if (layer.foot) {
          image.setOrigin((layer.foot.x - layer.x) / image.displayWidth, (layer.foot.y - layer.y) / image.displayHeight);
        } else {
          image.setOrigin(0.5, 1);
        }
        this.player = image;
        continue;
      }
      const entity = this.view.entities.find((e) => e.model !== undefined && actorOf(e.model) === layer.actor);
      if (entity) {
        image.setVisible(entity.visible);
        this.sprites.set(entity.hotspot, image);
      }
    }
    this.drawn(this.view);
  }

  placePlayer(at: FloorPoint): void {
    this.player?.setPosition(at.x, at.y);
  }

  setVisible(hotspot: string, visible: boolean): void {
    this.sprites.get(hotspot)?.setVisible(visible);
  }

  /** How far over the player's feet their head is, in scene pixels. */
  headroom(): number {
    return this.player ? this.player.displayHeight * this.player.originY + 16 : 280;
  }

  private artKey(): string {
    return this.sprite().layers;
  }

  private sprite(): SceneSprite {
    const sprite = sceneSprite(this.view.model);
    if (!sprite) throw new Error(`"${this.view.model}" is not a scene model`);
    return sprite;
  }
}
