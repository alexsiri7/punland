# scenes

## Purpose

The places the player explores: rooms the cat walks around, things to look at and use, and exits between rooms.

## Requirements

### Requirement: Rooms
The game SHALL show one room at a time, with the player character in it.

#### Scenario: Opening scene
- WHEN a new game starts
- THEN the player is outside the pub (The Three Crows) where the bus has dropped them off

### Requirement: Click to walk
The player character MUST walk to the point the player clicks on the floor of the room.

#### Scenario: Walking
- WHEN the player clicks a walkable spot
- THEN the character walks there

### Requirement: Hotspots
Rooms SHALL contain hotspots (objects and characters) that show their name on hover and react when clicked.

#### Scenario: Hovering a hotspot
- WHEN the player hovers over a hotspot
- THEN its name is shown

#### Scenario: Clicking a hotspot
- WHEN the player clicks a hotspot
- THEN the character walks to it and the hotspot's action happens (a description, picking it up, talking, or using it)

### Requirement: Exits
Rooms SHALL have exits that take the player to other rooms.

#### Scenario: Entering the pub
- WHEN the player clicks the pub door in the opening scene
- THEN the player enters the pub interior room

### Requirement: Placeholder art
The skeleton SHALL work with placeholder art, and replacing a room's art MUST NOT require changing game logic.

#### Scenario: Swapping art
- WHEN a room's art file is replaced
- THEN the room shows the new art and its hotspots and exits still work
