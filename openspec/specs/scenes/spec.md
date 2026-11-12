# scenes

## Purpose

The places the player explores: rooms the cat walks around, things to look at and use, and exits between rooms.

## Requirements

### Requirement: Rooms
The game SHALL show one room at a time, with the player character in it.

#### Scenario: Opening scene
- WHEN a new game starts
- THEN the Arrival plays in the coach station: a coach arrives at a bay and leaves again
- AND the cat says "Punland." and introduces himself by name
- AND the beetroot cop tells him the music lot go to The Three Crows, the pub up the road, and to grab a map from the stand
- AND the player then has control, in the coach station

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
- WHEN the player clicks the pub door outside The Three Crows
- THEN the player enters the pub interior room

#### Scenario: Down the High Street
- WHEN the player takes the way down the High Street from outside The Three Crows
- THEN the High Street is shown, with the music shop, the Song Master's flyer and his intercom

### Requirement: The coach station
The coach station SHALL be where every new game starts: a street room with the beetroot cop, a map stand with free maps, a departures board, and the way up the road to outside The Three Crows.

#### Scenario: The coach station
- WHEN the player is in the coach station
- THEN the hint reads "Where every dreamer gets off. Free maps by the exit."
- AND its hotspots are the Beetroot cop, the Map stand, the Departures board and Up the road

#### Scenario: Picking up a map
- WHEN the player picks up a map from the map stand
- THEN the cat reads "Punland: free map." off it and the map is in the inventory
- AND after that, the map stand only gets the line "I've got one already. One map is plenty. Two maps is a library."

#### Scenario: Looking at the departures board
- WHEN the player looks at the departures board
- THEN the cat says "Next coach to Literal Village: tomorrow. Not that I'm going back."

#### Scenario: Up the road
- WHEN the player goes up the road from the coach station
- THEN the player is outside The Three Crows, where the hint reads "Live music below." and there is no beetroot cop
- AND the way "To the coach station" leads back

### Requirement: The map
Using the map SHALL open the Map, Punland from above, where only the places the cat knows about are marked.

#### Scenario: Places always marked
- WHEN the player opens the map
- THEN the Coach station and The Three Crows are marked

#### Scenario: Places marked once known
- WHEN the player opens the map
- THEN the High Street is marked only once the player has been there
- AND the Mayor's office is marked only once the strings are sold out

#### Scenario: Going to a place
- WHEN the player clicks a marked place on the map
- THEN the player goes there

#### Scenario: Closing the map
- WHEN the player closes the map
- THEN the player is back in the room, and on the spot, the map was opened from

### Requirement: The Three Crows
The pub SHALL have three crows behind the bar, a stage and a Wall of Fame.

#### Scenario: Looking at the Wall of Fame
- WHEN the player looks at the Wall of Fame
- THEN the cat describes its photos: the Rolling Stones as a pile of rocks, the Beetles with 60s haircuts, Tuna and Pike Turner, and Katty Purry

### Requirement: Placeholder art
The skeleton SHALL work with placeholder art, and replacing a room's art MUST NOT require changing game logic. A room's art is its art layer files while rooms are drawn in 2D, and its scene model once they are drawn in 3D (models spec).

#### Scenario: Swapping art
- WHEN a room's art file (its art layers in 2D, its scene model in 3D) is replaced
- THEN the room shows the new art and its hotspots and exits still work
