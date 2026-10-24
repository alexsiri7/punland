# inventory

## Purpose

The items the cat carries and how they are used to solve puzzles.

## Requirements

### Requirement: Picking up items
The player SHALL be able to pick up items from rooms into the inventory.

#### Scenario: Picking up
- WHEN the player clicks an item that can be picked up
- THEN it disappears from the room and appears in the inventory

### Requirement: Using items
The player SHALL be able to use an inventory item on a hotspot, and the game MUST respond whether or not that use does anything.

#### Scenario: A use that works
- WHEN the player uses an item on a hotspot that accepts it
- THEN the puzzle step happens

#### Scenario: A use that does not work
- WHEN the player uses an item on a hotspot that does not accept it
- THEN the cat says something to show it does not work

### Requirement: Starting inventory
A new game SHALL start with the broken guitar in the inventory.

#### Scenario: New game
- WHEN a new game starts
- THEN the inventory contains the broken guitar
