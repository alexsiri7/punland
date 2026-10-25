import Phaser from 'phaser';
import { items, START_ITEMS } from '../../content/items';
import { rooms, START_ROOM } from '../../content/rooms';
import type { InventoryState } from '../../domain/inventory';
import type { JourneyState } from '../../domain/journey';
import type { SaveGame } from '../../services/save';
import { palette, SCENE_HEIGHT, SCENE_WIDTH, UI_BAR_HEIGHT } from '../theme';
import { type RoomData, RoomScene } from './RoomScene';
import { Inventory } from './inventory';
import { Journey } from './journey';

/** 1280 x 640 scene plus the 160 px UI bar under it (docs/design/STYLE.md). */
export const GAME_WIDTH = SCENE_WIDTH;
export const GAME_HEIGHT = SCENE_HEIGHT + UI_BAR_HEIGHT;

export interface StartOptions {
  /** The game to resume; a new game when left out. An unknown room starts in the opening room. */
  save?: SaveGame | undefined;
  /** Called with the game state whenever it changes. */
  autosave?: (game: SaveGame) => void;
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
    const { save, autosave } = options;
    const inventory = save?.inventory ? Inventory.restore(knownItems(save.inventory)) : new Inventory(START_ITEMS);
    const journey = save?.journey ? Journey.restore(knownRooms(save.journey)) : new Journey();
    game.scene.start(RoomScene.KEY, { room: save?.room ?? START_ROOM, inventory, journey, autosave } satisfies RoomData);
  });
  return game;
}

// A save can name items and rooms the content no longer has (content changed since): drop them.
function knownItems(state: InventoryState): InventoryState {
  return { items: state.items.filter((id) => Object.hasOwn(items, id)), pickedUp: state.pickedUp };
}

function knownRooms(state: JourneyState): JourneyState {
  const left = Object.fromEntries(Object.entries(state.left).filter(([, place]) => Object.hasOwn(rooms, place.room)));
  return { left, gathered: state.gathered };
}
