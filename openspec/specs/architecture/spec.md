# architecture

## Purpose

How the game's code is organised, so that story, rules and the look can each change without the others: a pure game model, rules that turn player commands into new state and events, content checked against schemas, and presentation behind a renderer interface that a 2D or a 3D renderer can fill. The layers, the asset contract and the reasons are in docs/ARCHITECTURE.md. This capability's acceptance tests are unit tests (vitest) rather than browser tests, because what it promises is about the code, not about what the player sees.

## Requirements

### Requirement: Layered code
The frontend SHALL be split into the layers named in docs/ARCHITECTURE.md (domain, rules, content, assets, services, presentation, app), and each layer MUST import only the layers it is allowed to. The domain and rules layers MUST NOT import a rendering engine, the DOM, browser globals, the network or any layer above them.

#### Scenario: An import that breaks the layering
- WHEN code in the domain or rules layer imports a rendering engine, the DOM, a browser global, the network or a layer above it
- THEN the unit tests fail, naming the file and the import

#### Scenario: One engine per renderer
- WHEN code outside a renderer's own folder imports that renderer's engine (Phaser or Three.js)
- THEN the unit tests fail, naming the file and the import

### Requirement: Rules as commands and events
Every player action SHALL be a command that the rules layer applies to the game state, giving the new state and a list of events, without a renderer or the DOM. Presentation MUST only send commands and show events; it MUST NOT change the game state itself.

#### Scenario: Playing without a renderer
- GIVEN a new game's state
- WHEN the commands for picking up the flyer, walking into the pub and using the flyer on the bartender are applied in order
- THEN the resulting state and events are the ones the game shows for those actions, and no renderer or DOM was needed

#### Scenario: Use X on Y
- WHEN an item is used on a hotspot
- THEN the rules give the hotspot's response for that item when it accepts it, and the item's refusal when it does not

### Requirement: Serialisable game state
The game state SHALL be plain data that can be saved and restored, and saves made by earlier versions of the game MUST still load.

#### Scenario: Saving and restoring
- WHEN a game state is saved and the save is loaded again
- THEN the restored state equals the saved one

#### Scenario: An older save
- WHEN a save written before this change is loaded
- THEN the game resumes in the saved room with the saved inventory and journey

### Requirement: Validated content
Content data (worlds, rooms, hotspots, items, characters, objects and the model registry) SHALL be checked against its schema, and content that does not hold together MUST be reported with the file and the field.

#### Scenario: A broken content file
- WHEN a content file names an unknown room, item, entity or model, or lacks a required field
- THEN the unit tests fail, naming the file and the field

### Requirement: Interactions as data
What a hotspot does SHALL be content data: for each verb (and, for using an item, each item) a list of conditions and effects, so a new puzzle step needs no code change.

#### Scenario: Adding a puzzle step
- WHEN a content file gives a hotspot a new response to an item, with effects the rules already know
- THEN using that item on that hotspot plays the new response, with no code change

### Requirement: Replaceable renderer
The presentation SHALL sit behind a renderer interface, so a renderer can be added or replaced without changing the domain, rules or content layers. Whatever the renderer, the game MUST keep the same public interface: the `#game` data attributes (`data-scene`, `data-world`, `data-player` in 1280 × 640 scene pixels, `data-hover`, `data-say`) and the DOM controls (hotspot buttons, inventory, world switcher, UI bar).

#### Scenario: Swapping the renderer
- WHEN the game runs with a different renderer
- THEN the same content plays the same, and the data attributes and DOM controls are the same
