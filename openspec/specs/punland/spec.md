# Tune Story (working title)

## Purpose

Monkey Island-style point-and-click adventure game played in the browser. A teenage cat from Literal Village arrives in Punland, a city of animals and plants, to make it as a musician. AI-improvised dialogue, puzzles across three worlds (street, online, songwriting dream), four acts with the last act branching into different endings. Working title: Tune Story.

## Requirements

### Requirement: Playable in the browser
The game SHALL be playable in a desktop web browser at a public URL, with no install.

#### Scenario: Opening the game
- WHEN a player opens the game's URL in a desktop browser
- THEN a title screen is shown with the working title and a New game button

### Requirement: New game and continue
The title screen SHALL offer New game, and SHALL offer Continue when this browser has a saved game.

#### Scenario: Starting a new game
- WHEN the player chooses New game
- THEN the game starts in the opening scene

#### Scenario: Continuing
- GIVEN this browser has a saved game
- WHEN the player chooses Continue
- THEN the game resumes where the save left off
