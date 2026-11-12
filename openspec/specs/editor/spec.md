# editor

## Purpose

The owner's in-game scene editor, usable only by the owner on the live site. This spec starts with owner sign-in, the base every editor part builds on.

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
