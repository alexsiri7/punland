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

### Requirement: Act 1: the first show
Act 1 SHALL end when the three crows behind the bar of The Three Crows all agree to let the cat perform, each for its own condition.

#### Scenario: Act 1's goals
- WHEN a new game starts
- THEN Act 1 shows three goals, a working guitar, a song of his own and someone who lives here, and no open mic or late slot goal

#### Scenario: A working guitar
- GIVEN the dog bought the last string at the music shop
- WHEN the Mayor gives the cat a string from her mane and he uses it on the broken guitar
- THEN he has a working guitar
- AND WHEN he shows it to the first crow
- THEN that crow agrees

#### Scenario: A song of his own
- GIVEN the Song Master has taught the cat his song
- WHEN the cat finds the dog on the pub stage playing it
- THEN the Song Master stops answering his intercom and the dream world opens
- AND WHEN the cat gives the second crow a song he wrote in the dream
- THEN that crow agrees

#### Scenario: Someone who lives here
- WHEN the third crow is asked
- THEN he won't vouch for the cat
- AND WHEN the bartender's conversation reaches its goal
- THEN she gets the cat a kitchen job and the third crow agrees

#### Scenario: The first show
- WHEN all three crows have agreed
- THEN Act 1 ends with the cat's first show and Act 2 starts

### Requirement: Story as content
Rooms, hotspots, items, characters, puzzles and acts SHALL be defined as content data, so story can be added or changed without changing game code.

#### Scenario: Adding a puzzle
- WHEN a new puzzle is added to the content data
- THEN it is playable without code changes
