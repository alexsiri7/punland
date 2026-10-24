import Phaser from 'phaser';
import { OpeningScene } from './scenes/OpeningScene';
import { palette, SCENE_HEIGHT, SCENE_WIDTH, UI_BAR_HEIGHT } from './theme';

/** 1280 x 640 scene plus the 160 px UI bar under it (docs/design/STYLE.md). */
export const GAME_WIDTH = SCENE_WIDTH;
export const GAME_HEIGHT = SCENE_HEIGHT + UI_BAR_HEIGHT;

export interface StartOptions {
  /** Room id to start in; defaults to the opening scene. */
  room?: string;
}

/**
 * Boots Phaser into the given container. The current scene's key is mirrored
 * on the container as `data-scene` so tests (and the DOM) can see which room
 * is showing without reading the canvas.
 */
export function startGame(parent: HTMLElement, options: StartOptions = {}): Phaser.Game {
  const room = options.room ?? OpeningScene.KEY;
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: palette.uiGround,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    // Rooms are registered here; issue #4 replaces this with rooms loaded from content data.
    scene: [],
    banner: false,
  });
  game.events.once(Phaser.Core.Events.READY, () => {
    game.scene.add(OpeningScene.KEY, OpeningScene, false);
    const key = game.scene.getScene(room) ? room : OpeningScene.KEY;
    game.scene.start(key);
  });
  return game;
}
