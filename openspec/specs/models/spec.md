# models

## Purpose

The game's 3D look. Every scene, character and object is a 3D model, defined once in a model registry and reused wherever it appears, drawn in the Tune Story look (docs/design/STYLE.md). Placeholder models stand in until the designer delivers the real ones, which follow the asset contract in docs/ARCHITECTURE.md and drop in without code changes.

## Requirements

### Requirement: 3D rooms
Rooms SHALL be drawn in 3D from their scene model, seen through that room's fixed camera, in the Tune Story look: flat two-tone shading with a hard terminator, light from the upper left, hard cast shadows, no outlines and a fine grain.

#### Scenario: Opening scene in 3D
- WHEN a new game starts
- THEN the opening room is drawn from its scene model, with the player character's model standing on its floor

### Requirement: One model per entity
Each scene, character and object SHALL have exactly one entry in the model registry, giving its model file and metadata (kind, anchors, hit areas, animations), and content SHALL refer to models only by that entry's id, so a model is defined once and reused in every room it appears in.

#### Scenario: The same model in two rooms
- WHEN a character or object appears in two rooms
- THEN both rooms show the model from its one registry entry

### Requirement: Asset contract
Model files SHALL follow the asset contract in docs/ARCHITECTURE.md: format, units, axes, origin, node names, anchors, animation names and budgets. A model file that breaks the contract MUST fail the unit tests.

#### Scenario: A model that breaks the contract
- WHEN a model file lacks a required node or animation, uses a forbidden glTF extension, or is over its budget
- THEN the unit tests fail, naming the file and the rule it breaks

### Requirement: Placeholder models
Every registry entry SHALL have a placeholder model that follows the asset contract and uses the Tune Story palette, until the designer's model replaces it. Replacing a model MUST NOT require a code or content change.

#### Scenario: Replacing a placeholder
- WHEN a placeholder model file is replaced by a model that follows the contract
- THEN the game shows the new model, and its hotspots and exits still work

### Requirement: Picking in 3D
Clicks and hovers SHALL hit what is drawn: the pointer over an entity's model or hit area hovers its hotspot, a click on it activates the hotspot, and a click on the floor walks the player there.

#### Scenario: Hovering a model
- WHEN the player moves the pointer over a hotspot's model
- THEN the hotspot's name is shown

#### Scenario: Clicking a model
- WHEN the player clicks a hotspot's model
- THEN the character walks to it and the hotspot's action happens

#### Scenario: Walking on a 3D floor
- WHEN the player clicks a walkable spot of a 3D room's floor
- THEN the character walks there

### Requirement: Character animation
Characters SHALL play the animation that matches what they are doing: walking while they walk, idle while they stand, and talking while they speak. The animation the player character plays SHALL be mirrored on the `#game` container as `data-player-animation`.

#### Scenario: Walking animation
- WHEN the player character walks
- THEN its walk animation plays, and its idle animation once it stops
