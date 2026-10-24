import Phaser from 'phaser';
import { PROTAGONIST } from '../content/protagonist';
import { type Hotspot, type HotspotAction, type Point, type Room, rooms, START_ROOM } from '../content/rooms';
import { createHotspotLayer } from '../room/hotspots';
import { nearestWalkable } from '../room/walk';
import { fonts, hex, palette, SCENE_HEIGHT, SCENE_WIDTH, UI_BAR_HEIGHT } from '../theme';

/** public/rooms/<room>/art.json, written by scripts/render-art.mjs from art/<room>/scene.svg. */
interface RoomArt {
  room: string;
  width: number;
  height: number;
  scale: number;
  layers: { key: string; file: string; x: number; y: number; depth: number; actor?: string; foot?: Point }[];
}

export interface RoomData {
  room: string;
  /** Where the player stands; the room's start when left out. */
  at?: Point;
}

const WALK_SPEED = 320; // scene px per second
const SPEECH_DEPTH = 150;
const UI_DEPTH = 200;

/**
 * Shows one room at a time, from its content (src/content/rooms/<room>.json: floor,
 * hotspots, exits) and its art (public/rooms/<room>/: swappable layer files). Nothing here
 * is specific to a room. What the canvas shows is mirrored on the #game container for tests
 * and the DOM: data-scene (room id), data-player ("x,y"), data-hover, data-say.
 */
export class RoomScene extends Phaser.Scene {
  static readonly KEY = 'room';

  private id = START_ROOM;
  private room!: Room;
  private at!: Point;
  private target: Point | null = null;
  private pending: HotspotAction | null = null;
  private player: Phaser.GameObjects.Image | null = null;
  private speech!: Phaser.GameObjects.Text;
  private speechTimer: Phaser.Time.TimerEvent | null = null;
  private actionVerb!: Phaser.GameObjects.Text;
  private actionName!: Phaser.GameObjects.Text;

  constructor() {
    super(RoomScene.KEY);
  }

  init(data: RoomData): void {
    this.id = Object.hasOwn(rooms, data.room) ? data.room : START_ROOM;
    this.room = rooms[this.id];
    this.at = { ...(data.at ?? this.room.start) };
    this.target = null;
    this.pending = null;
    this.player = null;
    this.speechTimer = null;
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
    for (const layer of art.layers) {
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
      }
    }
    this.drawUiBar();
    this.speech = this.add
      .text(0, 0, '', {
        fontFamily: fonts.ui,
        fontStyle: '500',
        fontSize: '20px',
        color: palette.uiText,
        stroke: palette.castShadow,
        strokeThickness: 4,
        align: 'center',
        wordWrap: { width: 520 },
        resolution: 2,
      })
      .setOrigin(0.5, 1)
      .setDepth(SPEECH_DEPTH)
      .setVisible(false);

    const canvas = this.game.canvas;
    const container = canvas.parentElement;
    if (container) {
      const hotspots = createHotspotLayer(container, this.room.hotspots, {
        hover: (h) => this.hover(h),
        activate: (h) => this.activate(h),
      });
      const layout = () => hotspots.layout(canvas);
      layout();
      this.scale.on(Phaser.Scale.Events.RESIZE, layout);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.scale.off(Phaser.Scale.Events.RESIZE, layout);
        hotspots.destroy();
      });
      container.dataset.scene = this.id;
      container.dataset.hover = '';
      container.dataset.say = '';
    }
    this.placePlayer();

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (pointer.worldY >= SCENE_HEIGHT) return;
      this.walkTo(nearestWalkable({ x: pointer.worldX, y: pointer.worldY }, this.room.walkable), null);
    });
  }

  update(): void {
    if (!this.target) return;
    // Phaser's smoothed delta is capped per frame, so a slow or unfocused page would walk in slow motion.
    const delta = this.game.loop.rawDelta;
    const dx = this.target.x - this.at.x;
    const dy = this.target.y - this.at.y;
    const left = Math.hypot(dx, dy);
    const step = (WALK_SPEED * delta) / 1000;
    if (left <= step) {
      this.at = { ...this.target };
      this.target = null;
    } else {
      this.at = { x: this.at.x + (dx * step) / left, y: this.at.y + (dy * step) / left };
    }
    this.placePlayer();
    if (!this.target && this.pending) {
      const action = this.pending;
      this.pending = null;
      this.run(action);
    }
  }

  private artKey(): string {
    return `${this.id}-art`;
  }

  private walkTo(target: Point, then: HotspotAction | null): void {
    this.say(null);
    this.target = { ...target };
    this.pending = then;
  }

  private activate(h: Hotspot): void {
    this.walkTo(h.walkTo, h.action);
  }

  private run(action: HotspotAction): void {
    switch (action.type) {
      case 'say':
        this.say(action.line);
        break;
      case 'exit':
        this.scene.restart({ room: action.room, at: action.at } satisfies RoomData);
        break;
      default:
        action satisfies never;
    }
  }

  private placePlayer(): void {
    this.player?.setPosition(this.at.x, this.at.y);
    this.setData('player', `${Math.round(this.at.x)},${Math.round(this.at.y)}`);
  }

  /** Shows a line over the player's head for a while; null hushes them. */
  private say(line: string | null): void {
    this.speechTimer?.remove();
    this.speechTimer = null;
    this.setData('say', line ?? '');
    if (line === null) {
      this.speech.setVisible(false);
      return;
    }
    const headroom = this.player ? this.player.displayHeight * this.player.originY + 16 : 280;
    this.speech.setText(line).setVisible(true);
    const half = this.speech.width / 2 + 16;
    this.speech.setPosition(
      Phaser.Math.Clamp(this.at.x, half, SCENE_WIDTH - half),
      Math.max(this.speech.height + 16, this.at.y - headroom),
    );
    this.speechTimer = this.time.delayedCall(Math.max(3000, 60 * line.length), () => this.say(null));
  }

  private hover(h: Hotspot | null): void {
    this.setData('hover', h?.name ?? '');
    this.setActionLine(h ? h.verb : this.room.place.verb, h ? h.name : this.room.place.name);
  }

  private setData(key: 'player' | 'hover' | 'say', value: string): void {
    const container = this.game.canvas.parentElement;
    if (container) container.dataset[key] = value;
  }

  /** The UI bar under the scene (STYLE.md, UI bar). Inventory slots arrive with #5/#8. */
  private drawUiBar(): void {
    const top = SCENE_HEIGHT;
    this.add.rectangle(0, top, SCENE_WIDTH, UI_BAR_HEIGHT, hex(palette.uiGround)).setOrigin(0).setDepth(UI_DEPTH);
    this.add.rectangle(0, top, SCENE_WIDTH, 1, hex(palette.divider)).setOrigin(0).setDepth(UI_DEPTH + 1);

    const left = 32;
    this.add
      .text(left, top + 40, this.room.label, {
        fontFamily: fonts.ui,
        fontSize: '12px',
        color: palette.labelText,
        letterSpacing: 2,
        resolution: 2,
      })
      .setDepth(UI_DEPTH + 1);
    const action = { fontFamily: fonts.ui, fontStyle: '500', fontSize: '22px', resolution: 2 };
    this.actionVerb = this.add
      .text(left, top + 62, '', { ...action, color: palette.mutedText })
      .setDepth(UI_DEPTH + 1);
    this.actionName = this.add
      .text(left, top + 62, '', { ...action, color: palette.signGold })
      .setDepth(UI_DEPTH + 1);
    this.setActionLine(this.room.place.verb, this.room.place.name);
    this.add
      .text(left, top + 98, this.room.hint, {
        fontFamily: fonts.ui,
        fontSize: '13px',
        color: palette.labelText,
        resolution: 2,
      })
      .setDepth(UI_DEPTH + 1);
  }

  private setActionLine(verb: string, name: string): void {
    this.actionVerb.setText(verb);
    this.actionName.setText(name).setX(this.actionVerb.x + this.actionVerb.width + 7);
  }
}
