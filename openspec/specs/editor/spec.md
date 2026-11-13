# editor

## Purpose

The owner's in-game scene editor, usable only by the owner on the live site: owner sign-in, the base every editor part builds on, then edit mode and publishing an edited room as a pull request.

## Requirements

### Requirement: Owner sign-in
The game SHALL let the owner, and only the owner, sign in with Google from the title screen. The backend MUST verify the Google ID token server-side and accept only the configured owner email. Without a Google client, an owner email and a session secret configured, the game SHALL look and play exactly as without the editor.

#### Scenario: Sign-in not configured
- GIVEN no Google client or owner email is configured
- WHEN the title screen shows
- THEN it offers no sign-in, and the game plays as before

#### Scenario: The owner signs in
- WHEN the owner signs in with the owner's Google account
- THEN the game shows an Edit button

#### Scenario: Someone else signs in
- WHEN anyone else signs in
- THEN sign-in is refused, with no hint that an editor exists, and no Edit button is shown

#### Scenario: Signing out
- WHEN the owner signs out
- THEN the session ends and the Edit button is gone

### Requirement: Owner session
The owner's session SHALL be a cookie signed with a server secret that is HttpOnly, Secure and SameSite=Strict, and that lasts at most 12 hours. Signing out SHALL clear it.

#### Scenario: The session cookie
- WHEN the owner signs in
- THEN the session cookie is HttpOnly, Secure, SameSite=Strict and expires within 12 hours

### Requirement: Owner-only endpoints
Every editor endpoint MUST require the owner's session and a custom CSRF header, checked on the server. `GET /me` SHALL say whether the request is the owner's. CORS SHALL keep its allowed origins and never allow `*`.

#### Scenario: No session
- WHEN an editor endpoint is called without a session
- THEN it is refused

#### Scenario: Forged session
- WHEN an editor endpoint is called with a session cookie that was not signed with the server secret, or was changed after signing
- THEN it is refused

#### Scenario: Expired session
- WHEN an editor endpoint is called with a session older than its lifetime
- THEN it is refused

#### Scenario: No CSRF header
- WHEN an editor endpoint or `/me` is called without the CSRF header
- THEN it is refused, even with the owner's session

#### Scenario: Who is signed in
- WHEN the game asks `/me`
- THEN the answer says whether the request carries the owner's session

### Requirement: Edit mode
The owner's Edit button, or the E key, SHALL pause the game and show over the room every hotspot's click area and name, each spot, each walk-to point, the start and the floor outline. The owner SHALL be able to drag those points, only onto the floor, add or remove floor corners, and undo or redo. Each edit MUST apply live and SHALL be kept as a draft in the browser until published or discarded. Pressing Edit again SHALL return to play. Only the owner SHALL have edit mode.

#### Scenario: Entering and leaving edit mode
- GIVEN the owner is playing
- WHEN the owner presses Edit
- THEN the game pauses and every hotspot, spot, walk-to point, the start and the floor outline show
- AND pressing Edit again returns to play

#### Scenario: Dragging a spot
- WHEN the owner drags a character's spot to another place on the floor and returns to play
- THEN the character stands there, and clicking there in play reaches the character, before anything is published

#### Scenario: A draft survives a reload
- GIVEN the owner has moved a spot
- WHEN the page is reloaded and the owner plays again
- THEN the spot is where the owner moved it

#### Scenario: Not the owner
- WHEN anyone but the owner plays
- THEN there is no Edit button, and the E key opens nothing

### Requirement: Publishing a room
Publishing SHALL check the edited room with the content validator and the room's floor, and MUST refuse an invalid edit with a message, sending nothing. The backend SHALL take the owner's edited points (owner session and CSRF header) and open one pull request, labelled `editor`, changing only `frontend/src/content/rooms/<room>.json`, with before/after screenshots. It MUST use the server's `EDITOR_GITHUB_TOKEN`, which never reaches the browser; without it, publishing SHALL be refused.

#### Scenario: Publishing opens a pull request
- WHEN the owner publishes an edited room
- THEN one pull request opens, changing only that room's file, labelled `editor`, with before/after screenshots
- AND the page links to it

#### Scenario: An invalid edit is refused
- WHEN the owner publishes an edit that breaks the room, such as a floor that is not convex
- THEN publishing is refused with a message and no pull request is opened
- AND another room's draft never keeps a room from being published

#### Scenario: The room changed since the edit began
- GIVEN the room's file changed on main after the page loaded
- WHEN the owner publishes an edit of it
- THEN publishing is refused with a message and no pull request is opened, so no point the owner didn't move is taken back

#### Scenario: Publishing without a session
- WHEN the publish endpoint is called without the owner's session or the CSRF header
- THEN it is refused

#### Scenario: Publishing not set up
- GIVEN no `EDITOR_GITHUB_TOKEN` is configured
- WHEN the owner publishes
- THEN publishing is refused, and nothing is sent to GitHub
