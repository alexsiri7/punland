import Phaser from 'phaser';
import { PROTAGONIST } from '../../content/protagonist';
import type { FloorPoint, GameEvent, Room } from '../../domain';
import type { Session } from '../session';
import { SCENE_HEIGHT } from '../theme';
import type { DrawnRoom, ScenePoint } from '../ui';

/** public/rooms/<room>/art.json, written by scripts/render-art.mjs from art/<room>/scene.svg. */
interface RoomArt {
  room: string;
  width: number;
  height: number;
  scale: number;
  layers: { key: string; file: string; x: number; y: number; depth: number; actor?: string; foot?: FloorPoint }[];
}

/** Told when the session's room is drawn and takes input, and when its floor is clicked: the DOM UI and mirror. */
export interface RoomShown {
  shown(room: DrawnRoom): void;
  walked(): void;
}

/** The room to show: the session's. Everything else is in the session. */
export interface RoomData {
  room: string;
}

/**
 * Shows the session's room, from its content (src/content/rooms/<room>.json: floor, hotspots,
 * exits, items) and its art (public/rooms/<room>/: swappable layer files). Nothing here is
 * specific to a room, and nothing here is a game rule: input becomes commands to the session,
 * and the session's events are drawn. All text and controls are the DOM UI's (presentation/ui),
 * which it tells when the room is drawn.
 */
export class RoomScene extends Phaser.Scene {
  static readonly KEY = 'room';

  private id = '';
  private room!: Room;
  private player: Phaser.GameObjects.Image | null = null;
  /** Room sprites of hotspots that come and go, by hotspot id. */
  private hotspotSprites = new Map<string, Phaser.GameObjects.Image>();
  private unsubscribe: () => void = () => {};

  constructor(
    private readonly session: Session,
    private readonly view: RoomShown,
  ) {
    super(RoomScene.KEY);
  }

  init(data: RoomData): void {
    const room = this.session.content.rooms[data.room];
    if (!room) throw new Error(`room "${data.room}" is not in the content`);
    this.id = data.room;
    this.room = room;
    this.player = null;
    this.hotspotSprites = new Map();
  }

  preload(): void {
    const artKey = this.artKey();
    const base = `rooms/${this.id}/`;
    const loadLayers = (art: RoomArt) => {
      for (const layer of art.layers) {
        if (!this.textures.exists(layer.key)) this.load.image(layer.key, `${base}${layer.file}`);
      }
    };
    if (this.cache.json.exists(artKey)) {
      loadLayers(this.cache.json.get(artKey) as RoomArt);
      return;
    }
    this.load.json(artKey, `${base}art.json`);
    this.load.once(`filecomplete-json-${artKey}`, (_key: string, _type: string, art: RoomArt) => loadLayers(art));
  }

  create(): void {
    const art = this.cache.json.get(this.artKey()) as RoomArt;
    const absent = new Set(this.room.hotspots.filter((h) => !this.session.isPresent(h)).map((h) => h.id));
    for (const layer of art.layers) {
      if (layer.actor && absent.has(layer.actor)) continue;
      const image = this.add
        .image(layer.x, layer.y, layer.key)
        .setOrigin(0)
        .setScale(1 / art.scale)
        .setDepth(layer.depth);
      if (layer.actor === PROTAGONIST.actor) {
        if (layer.foot) {
          image.setOrigin((layer.foot.x - layer.x) / image.displayWidth, (layer.foot.y - layer.y) / image.displayHeight);
        } else {
          image.setOrigin(0.5, 1);
        }
        this.player = image;
      } else if (layer.actor) {
        this.hotspotSprites.set(layer.actor, image);
      }
    }
    this.placePlayer(this.session.state.at);
    this.unsubscribe = this.session.subscribe((event) => this.draw(event));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe());

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (pointer.worldY >= SCENE_HEIGHT) return;
      this.session.dispatch({ type: 'walk', to: { x: pointer.worldX, y: pointer.worldY } });
      this.view.walked();
    });
    this.view.shown({
      canvas: this.game.canvas,
      head: () => this.head(),
      onResize: (layout) => {
        this.scale.on(Phaser.Scale.Events.RESIZE, layout);
        return () => this.scale.off(Phaser.Scale.Events.RESIZE, layout);
      },
    });
  }

  override update(): void {
    if (!this.session.state.walk) return;
    // Phaser's smoothed delta is capped per frame, so a slow or unfocused page would walk in slow motion.
    this.session.dispatch({ type: 'tick', dtMs: this.game.loop.rawDelta });
  }

  private draw(event: GameEvent): void {
    switch (event.type) {
      case 'moved':
        this.placePlayer(event.at);
        break;
      case 'hotspotHidden':
        this.hotspotSprites.get(event.hotspot)?.destroy();
        this.hotspotSprites.delete(event.hotspot);
        break;
      case 'hotspotShown':
      case 'roomChanged':
        this.redraw();
        break;
      case 'said':
      case 'hushed':
      case 'pickedUp':
      case 'itemRemoved':
      case 'selected':
      case 'arrived':
      case 'worldChanged':
      case 'gathered':
      case 'conversationStarted':
      case 'saved':
        break;
      default:
        event satisfies never;
    }
  }

  /** Draws the session's room afresh. This scene draws nothing more: its events are done with. */
  private redraw(): void {
    this.unsubscribe();
    this.scene.restart({ room: this.session.state.room } satisfies RoomData);
  }

  private artKey(): string {
    return `${this.id}-art`;
  }

  private placePlayer(at: FloorPoint): void {
    this.player?.setPosition(at.x, at.y);
  }

  /** Just over the player's head, where their speech goes. */
  private head(): ScenePoint {
    const { at } = this.session.state;
    const headroom = this.player ? this.player.displayHeight * this.player.originY + 16 : 280;
    return { x: at.x, y: at.y - headroom };
  }
}
