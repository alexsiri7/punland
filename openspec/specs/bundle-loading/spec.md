# bundle-loading

## Purpose

The engine plays any game that Annie exports, not just Tune Story. A bundle is a folder with a manifest, the content files, the model registry and models, and the characters' AI sheets. The engine loads it, checks it and refuses what it cannot play, so the game's content lives in Annie and the engine holds none of it.

## Requirements

### Requirement: Loading a bundle
The game SHALL load its worlds, rooms, items, characters, objects, stats, acts, model registry and character sheets from a bundle named by a manifest, and play it.

#### Scenario: Playing an exported bundle
- WHEN a bundle exported by Annie is loaded
- THEN the game starts in the first world's start room and plays as the same content did when it lived in this repository

### Requirement: Manifest and schema version
The bundle's manifest SHALL name the game and the schema version of its files. The game MUST refuse a bundle whose major schema version it does not support, and say which version it needs.

#### Scenario: An unsupported major version
- WHEN a bundle names a major schema version the game does not support
- THEN nothing is played and the game says which version it supports and which the bundle has

#### Scenario: A newer minor version
- WHEN a bundle names a newer minor version of a supported major version
- THEN it loads, and optional fields the game does not know are ignored

### Requirement: Checked before playing
A bundle MUST be checked with the same validators as content kept in the repository, and any problem MUST be listed with its file and field before anything is played.

#### Scenario: A broken bundle
- WHEN a bundle's room names an item that does not exist
- THEN the game lists the file and the field and does not start

### Requirement: No game content in the engine
The engine's code SHALL not depend on the content of any one game. Its unit tests MUST use fixture content of their own, and a bundle for a different game MUST play with no code change.

#### Scenario: A different game
- WHEN a small bundle for another game is loaded
- THEN it plays through the same rules and renderer with no code change

### Requirement: Saves belong to a game
A save SHALL record which game it was made for. The game MUST NOT load a save made for a different game, and MUST say so instead of loading a wrong state.

#### Scenario: A save from another game
- WHEN the player continues and the save was made for a different game
- THEN the game does not load it, and starts a new game or says why it cannot continue
