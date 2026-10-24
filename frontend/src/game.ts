import Phaser from 'phaser';
import { START_ITEMS } from './content/items';
import { START_ROOM } from './content/rooms';
import { Inventory } from './inventory';
import { type RoomData, RoomScene } from './scenes/RoomScene';
import { palette, SCENE_HEIGHT, SCENE_WIDTH, UI_BAR_HEIGHT } from './theme';

/** 1280 x 640 scene plus the 160 px UI bar under it (docs/design/STYLE.md). */
export const GAME_WIDTH = SCENE_WIDTH;
export const GAME_HEIGHT = SCENE_HEIGHT + UI_BAR_HEIGHT;

export interface StartOptions {
  /** Room id to start in; the opening room when left out or unknown. */
  room?: string;
}

/**
 * Boots Phaser into the given container. The room that is showing is mirrored
 * on the container as `data-scene` (its id) so tests (and the DOM) can see it
 * without reading the canvas; see RoomScene for the rest.
 */
export function startGame(parent: HTMLElement, options: StartOptions = {}): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: palette.uiGround,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [],
    banner: false,
  });
  game.events.once(Phaser.Core.Events.READY, () => {
    game.scene.add(RoomScene.KEY, RoomScene, false);
    const inventory = new Inventory(START_ITEMS);
    game.scene.start(RoomScene.KEY, { room: options.room ?? START_ROOM, inventory } satisfies RoomData);
  });
  return game;
}
