# worlds

## Purpose

The three worlds the player moves between: the street (the real city), online (the band's social media, shown visually) and the dream (songwriting, where things done in the street turn up as parts of songs).

## Requirements

### Requirement: Switching worlds
The game SHALL show the three worlds and let the player switch to any world that is unlocked.

#### Scenario: Switching
- WHEN the player chooses an unlocked world
- THEN the game shows that world's rooms

#### Scenario: Locked world
- WHEN a world is locked
- THEN it is shown as locked and cannot be entered

### Requirement: Things cross worlds
Items and facts from one world SHALL be usable in the others where the story allows.

#### Scenario: Something done in the street turns up in the dream
- GIVEN the player did something in the street that the story marks as dream material
- WHEN the player enters the dream
- THEN that thing appears there and can be used in a song

### Requirement: Placeholder worlds
In the skeleton, the online and dream worlds SHALL each have at least one placeholder room.

#### Scenario: Visiting a placeholder world
- WHEN the player enters the online or dream world
- THEN a placeholder room is shown
