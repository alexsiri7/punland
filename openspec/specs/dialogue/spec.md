# dialogue

## Purpose

Conversations with characters, improvised by AI: the character replies in character and the player picks one of three suggested replies or types their own.

## Requirements

### Requirement: Improvised conversations
Talking to a character SHALL show an AI-written line from that character, in character, using what that character knows and what has happened so far.

#### Scenario: Starting a conversation
- WHEN the player talks to a character
- THEN the character says an improvised line that fits who they are

### Requirement: Three options or your own
Each turn SHALL offer three suggested replies and a field to type a reply of the player's own.

#### Scenario: Picking an option
- WHEN the player picks a suggested reply
- THEN the cat says it and the character answers

#### Scenario: Typing a reply
- WHEN the player types and sends their own reply
- THEN the cat says it and the character answers

### Requirement: Conversation goals
A conversation MAY have a goal (such as getting past the bouncer). The suggested replies SHALL lean further towards the goal the more the player tries: at first none of the three reaches it, later one does, eventually all three do. A clever typed reply MAY reach the goal at any time.

#### Scenario: Escalating options
- GIVEN a conversation with a goal
- WHEN the player has tried several times without reaching it
- THEN at least one suggested reply reaches the goal

#### Scenario: Reaching the goal
- WHEN a reply reaches the conversation's goal
- THEN the game records it and the related puzzle step happens

### Requirement: Characters remember
Characters SHALL remember earlier conversations with the player in the same game.

#### Scenario: Coming back
- WHEN the player talks to a character again
- THEN the character can refer to what was said before

### Requirement: Leaving and failure
The player SHALL be able to leave a conversation at any time, and if the AI is unavailable the game MUST say so in character and let the player keep playing.

#### Scenario: AI unavailable
- WHEN the AI cannot be reached
- THEN the character gives a short canned line and the conversation ends without breaking the game

### Requirement: Spending limits
The game MUST limit how many AI dialogue turns one player can use in a period, and say so in character when the limit is reached.

#### Scenario: Limit reached
- WHEN a player reaches the turn limit
- THEN the character ends the conversation with a canned line
