import Phaser from 'phaser';
import { PROTAGONIST } from '../../content/protagonist';
import type { Command, Content, FloorPoint, GameEvent, GameState, Hotspot, Room } from '../../domain';
import { speechMs } from '../speech';
import { fonts, hex, palette, SCENE_HEIGHT, SCENE_WIDTH, UI_BAR_HEIGHT } from '../theme';
import { createHotspotLayer, type HotspotLayer } from './room/hotspots';
import { createInventoryBar, type InventoryBar } from './room/inventory';
import { createWorldSwitcher } from './room/worlds';

/** public/rooms/<room>/art.json, written by scripts/render-art.mjs from art/<room>/scene.svg. */
interface RoomArt {
  room: string;
  width: number;
  height: number;
  scale: number;
  layers: { key: string; file: string; x: number; y: number; depth: number; actor?: string; foot?: FloorPoint }[];
}

/** The game session the scene plays (app/session.ts): it reads the state and sends commands. */
export interface Session {
  readonly content: Content;
  readonly state: GameState;
  dispatch(command: Command): void;
  subscribe(listener: (event: GameEvent) => void): () => void;
  isPresent(hotspot: Hotspot): boolean;
}

/** What only the view knows, for the #game mirror (app/mirror.ts). */
export interface ViewMirror {
  /** The session's room is drawn and takes input. */
  shown(): void;
  /** The name of the hotspot under the pointer, empty for none. */
  hover(name: string): void;
}

/** The room to show: the session's. Everything else is in the session. */
export interface RoomData {
  room: string;
}

const SPEECH_DEPTH = 150;
const UI_DEPTH = 200;

/**
 * Shows the session's room, from its content (src/content/rooms/<room>.json: floor, hotspots,
 * exits, items) and its art (public/rooms/<room>/: swappable layer files). Nothing here is
 * specific to a room, and nothing here is a game rule: input becomes commands to the session,
 * and the session's events are drawn. Hotspots and inventory slots are DOM buttons over the
 * canvas.
 */
export class RoomScene extends Phaser.Scene {
  static readonly KEY = 'room';

  private id = '';
  private room!: Room;
  private player: Phaser.GameObjects.Image | null = null;
  private hotspots: HotspotLayer | null = null;
  private bar: InventoryBar | null = null;
  /** Room sprites of hotspots that come and go, by hotspot id. */
  private hotspotSprites = new Map<string, Phaser.GameObjects.Image>();
  /** The hotspot under the pointer. */
  private hovered: Hotspot | null = null;
  private unsubscribe: () => void = () => {};
  private speech!: Phaser.GameObjects.Text;
  private speechTimer: Phaser.Time.TimerEvent | null = null;
  private actionVerb!: Phaser.GameObjects.Text;
  private actionName!: Phaser.GameObjects.Text;

  constructor(
    private readonly session: Session,
    private readonly mirror: ViewMirror,
  ) {
    super(RoomScene.KEY);
  }

  init(data: RoomData): void {
    const room = this.session.content.rooms[data.room];
    if (!room) throw new Error(`room "${data.room}" is not in the content`);
    this.id = data.room;
    this.room = room;
    this.player = null;
    this.speechTimer = null;
    this.hotspots = null;
    this.bar = null;
    this.hotspotSprites = new Map();
    this.hovered = null;
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
    const present = this.room.hotspots.filter((h) => this.session.isPresent(h));
    const absent = new Set(this.room.hotspots.filter((h) => !present.includes(h)).map((h) => h.id));
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
      const hotspots = createHotspotLayer(container, present, {
        hover: (h) => this.hover(h),
        activate: (h) => this.session.dispatch({ type: 'activate', hotspot: h.id }),
      });
      const bar = createInventoryBar(container, {
        hover: (id) => this.hoverItem(id),
        select: (id) => {
          this.session.dispatch({ type: 'select', item: this.session.state.selected === id ? null : id });
          this.hoverItem(id);
        },
      });
      const switcher = createWorldSwitcher(container, this.session.content.worlds, this.room.world, {
        enter: (w) => this.session.dispatch({ type: 'enterWorld', world: w.id }),
      });
      this.hotspots = hotspots;
      this.bar = bar;
      this.renderInventory();
      const layout = () => {
        hotspots.layout(canvas);
        bar.layout(canvas);
        switcher.layout(canvas);
      };
      layout();
      this.scale.on(Phaser.Scale.Events.RESIZE, layout);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.scale.off(Phaser.Scale.Events.RESIZE, layout);
        hotspots.destroy();
        bar.destroy();
        switcher.destroy();
      });
    }
    this.placePlayer(this.session.state.at);
    this.unsubscribe = this.session.subscribe((event) => this.draw(event));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe());

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (pointer.worldY >= SCENE_HEIGHT) return;
      this.session.dispatch({ type: 'walk', to: { x: pointer.worldX, y: pointer.worldY } });
      this.hover(null);
    });
    this.mirror.shown();
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
      case 'said':
        this.say(event.line);
        break;
      case 'hushed':
        this.say(null);
        break;
      case 'pickedUp':
      case 'itemRemoved':
        this.renderInventory();
        break;
      case 'selected':
        this.renderInventory();
        this.hover(this.hovered);
        break;
      case 'hotspotHidden':
        this.hotspots?.remove(event.hotspot);
        this.hotspotSprites.get(event.hotspot)?.destroy();
        this.hotspotSprites.delete(event.hotspot);
        break;
      case 'hotspotShown':
      case 'roomChanged':
        this.redraw();
        break;
      case 'arrived':
      case 'worldChanged':
      case 'gathered':
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

  private renderInventory(): void {
    const { inventory, selected } = this.session.state;
    this.bar?.render(inventory.carried, selected);
  }

  private placePlayer(at: FloorPoint): void {
    this.player?.setPosition(at.x, at.y);
  }

  /** Shows a line over the player's head for a while; null hushes them. */
  private say(line: string | null): void {
    this.speechTimer?.remove();
    this.speechTimer = null;
    if (line === null) {
      this.speech.setVisible(false);
      return;
    }
    const { at } = this.session.state;
    const headroom = this.player ? this.player.displayHeight * this.player.originY + 16 : 280;
    this.speech.setText(line).setVisible(true);
    const half = this.speech.width / 2 + 16;
    this.speech.setPosition(
      Phaser.Math.Clamp(at.x, half, SCENE_WIDTH - half),
      Math.max(this.speech.height + 16, at.y - headroom),
    );
    this.speechTimer = this.time.delayedCall(speechMs(line), () => this.say(null));
  }

  private hover(h: Hotspot | null): void {
    this.hovered = h;
    this.mirror.hover(h?.name ?? '');
    const { selected } = this.session.state;
    if (selected !== null) {
      const item = this.itemName(selected);
      this.setActionLine(h ? `Use ${item} on` : 'Use', h ? h.name : item);
    } else {
      this.setActionLine(h ? h.verb : this.room.place.verb, h ? h.name : this.room.place.name);
    }
  }

  private hoverItem(id: string | null): void {
    if (id === null) this.hover(null);
    else this.setActionLine('Use', this.itemName(id));
  }

  private itemName(id: string): string {
    return this.session.content.items[id]?.name ?? id;
  }

  /** The UI bar under the scene (STYLE.md, UI bar). Its inventory slots are DOM (./room/inventory.ts). */
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
