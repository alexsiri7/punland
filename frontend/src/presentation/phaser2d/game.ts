import Phaser from 'phaser';
import { palette, SCENE_HEIGHT, SCENE_WIDTH, UI_BAR_HEIGHT } from '../theme';
import { type RoomData, RoomScene, type Session, type ViewMirror } from './RoomScene';

/** 1280 x 640 scene plus the 160 px UI bar under it (docs/design/STYLE.md). */
export const GAME_WIDTH = SCENE_WIDTH;
export const GAME_HEIGHT = SCENE_HEIGHT + UI_BAR_HEIGHT;

/** Boots Phaser into the given container, showing the session's room. */
export function startGame(parent: HTMLElement, session: Session, mirror: ViewMirror): Phaser.Game {
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
    game.scene.add(RoomScene.KEY, new RoomScene(session, mirror), true, {
      room: session.state.room,
    } satisfies RoomData);
  });
  return game;
}
