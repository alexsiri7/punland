import Phaser from 'phaser';
import { fonts, hex, palette, SCENE_HEIGHT, SCENE_WIDTH, UI_BAR_HEIGHT } from '../theme';

/** public/rooms/<room>/art.json, written by scripts/render-art.mjs from art/<room>/scene.svg. */
interface RoomArt {
  room: string;
  width: number;
  height: number;
  scale: number;
  layers: { key: string; file: string; x: number; y: number; depth: number; actor?: string }[];
}

const ROOM = 'opening';
const ART_KEY = `${ROOM}-art`;
const ROOM_BASE = `rooms/${ROOM}/`;

/**
 * The opening scene: Punland high street at dusk, outside The Three Crows, where the bus
 * has dropped the cat off. Art comes from the room's layer files (background, actors,
 * foreground), so replacing the art never touches this code. Issue #4 replaces this
 * scene with the content-driven room engine (walking, hotspots, exits).
 */
export class OpeningScene extends Phaser.Scene {
  static readonly KEY = 'opening';

  constructor() {
    super(OpeningScene.KEY);
  }

  preload(): void {
    this.load.json(ART_KEY, `${ROOM_BASE}art.json`);
    this.load.once(`filecomplete-json-${ART_KEY}`, (_key: string, _type: string, art: RoomArt) => {
      for (const layer of art.layers) this.load.image(layer.key, `${ROOM_BASE}${layer.file}`);
    });
  }

  create(): void {
    const art = this.cache.json.get(ART_KEY) as RoomArt;
    for (const layer of art.layers) {
      this.add
        .image(layer.x, layer.y, layer.key)
        .setOrigin(0)
        .setScale(1 / art.scale)
        .setDepth(layer.depth);
    }
    this.drawUiBar();

    const container = this.game.canvas.parentElement;
    if (container) container.dataset.scene = OpeningScene.KEY;
  }

  /** The UI bar under the scene (STYLE.md, UI bar). Inventory slots arrive with #5/#8. */
  private drawUiBar(): void {
    const top = SCENE_HEIGHT;
    this.add.rectangle(0, top, SCENE_WIDTH, UI_BAR_HEIGHT, hex(palette.uiGround)).setOrigin(0).setDepth(200);
    this.add.rectangle(0, top, SCENE_WIDTH, 1, hex(palette.divider)).setOrigin(0).setDepth(201);

    const left = 32;
    this.add
      .text(left, top + 40, 'PUNLAND · HIGH STREET', {
        fontFamily: fonts.ui,
        fontSize: '12px',
        color: palette.labelText,
        letterSpacing: 2,
        resolution: 2,
      })
      .setDepth(201);
    const verb = this.add
      .text(left, top + 62, 'Outside', {
        fontFamily: fonts.ui,
        fontStyle: '500',
        fontSize: '22px',
        color: palette.mutedText,
        resolution: 2,
      })
      .setDepth(201);
    this.add
      .text(left + verb.width + 7, top + 62, 'The Three Crows', {
        fontFamily: fonts.ui,
        fontStyle: '500',
        fontSize: '22px',
        color: palette.signGold,
        resolution: 2,
      })
      .setDepth(201);
    this.add
      .text(left, top + 98, 'The bus is gone. Live music below.', {
        fontFamily: fonts.ui,
        fontSize: '13px',
        color: palette.labelText,
        resolution: 2,
      })
      .setDepth(201);
  }
}
