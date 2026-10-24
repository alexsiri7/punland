# progress

## Purpose

Saving the game, the career stats that steer the story, and the acts the game is divided into.

## Requirements

### Requirement: Autosave
The game SHALL save progress automatically, without the player signing up.

#### Scenario: Closing and coming back
- WHEN the player closes the browser and opens the game again
- THEN Continue resumes from the last autosave

### Requirement: Career stats
The game SHALL track career stats, at least followers, musicians, practice and instruments, and show them to the player.

#### Scenario: A stat changes
- WHEN a story event changes a stat
- THEN the new value is shown and saved

### Requirement: Acts
The game SHALL be divided into acts. Acts 1 to 3 SHALL be the same for every player; the last act SHALL be chosen from the player's decisions and stats, leading to different endings.

#### Scenario: Finishing an act
- WHEN the player completes an act's goals
- THEN the next act starts

#### Scenario: Reaching the last act
- WHEN the player finishes the act before the last
- THEN the last act that matches their decisions and stats starts

### Requirement: Story as content
Rooms, hotspots, items, characters, puzzles and acts SHALL be defined as content data, so story can be added or changed without changing game code.

#### Scenario: Adding a puzzle
- WHEN a new puzzle is added to the content data
- THEN it is playable without code changes
