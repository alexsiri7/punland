# punland-api

FastAPI backend for Tune Story. See the repository's `CLAUDE.md` for commands and deploy.

## Saves

`GET`, `PUT` and `DELETE /saves` keep one autosave per anonymous player (header
`X-Player-Id: <uuid>`). The save is an opaque JSON object of at most 64 KiB; `GET` answers 204
when there is none.

- `DATABASE_URL` is the Postgres URL, authenticating as the app's own role (`punland`, or
  `punland_staging` on staging) through the session pooler on port 5432. Don't add
  `options=-c search_path=...`: the role's own search path picks its schema.
- Without `DATABASE_URL`, or when it is malformed, the database is down or a migration fails at
  startup, `/saves` answers 503 and the rest of the API keeps running. The game falls back to the
  save in the browser.
- Migrations (Alembic) live in `src/punland_api/migrations/versions/` and run at startup. To add
  one, copy `0002_conversations.py`, chain `revision`/`down_revision`, and change the table in
  `saves.py` to match (a test checks each migrated table against it). Use unqualified table names
  and plain `import a.b as c` lines: the unsafe-change check reads every added line under
  `migrations/` as SQL.

## Dialogue

`POST /dialogue/turn` (header `X-Player-Id: <uuid>`, body `{"character", "reply", "carrying"}`, `reply`
null to start, `carrying` the item ids the cat carries, for the character's `must_say` lines) answers `{"line", "options": [{"text", "reaches_goal"}], "goal_reached", "ended"}`.
Character sheets are content data in `src/punland_api/content/characters/<id>.json`.

- `REQUESTY_API_KEY` is the Requesty key (server-side only); `PUNLAND_DIALOGUE_MODEL` overrides
  the model. Without a key, or when the model fails, the character says its canned line and the
  conversation ends (`ended: true`, no options).
- Each player gets `TURNS_PER_DAY` (100) model-backed turns per UTC day, shared across every
  character and counted in memory (a restart resets them). Past that, every character says its
  canned line and the conversation ends (`ended: true`, no options) until the day turns over.
- Conversations are kept per player and character in the `conversations` table, next to the save;
  `DELETE /saves` (New game) clears them. Without a usable database they are kept in memory.

## Owner sign-in

The owner-only scene editor (`openspec/specs/editor`) starts with the owner signing in with
Google. Every route below needs the header `X-Punland-CSRF: 1`, or answers 403.

- `GET /me` answers `{"owner", "google_client_id"}`: whether the request carries the owner's
  session, and the Google client id when sign-in is configured (null otherwise, and the title
  screen offers no sign-in).
- `POST /auth/google` (`{"credential", "nonce"}`, the ID token from Google's redirect sign-in)
  checks the token with Google's tokeninfo endpoint, then its audience, issuer, expiry, nonce and
  verified email. Only `OWNER_EMAIL` gets `{"owner": true}` and the `punland_owner` cookie
  (HMAC-signed, HttpOnly, Secure, SameSite=Strict, 12 h). Every refusal is the same
  `{"owner": false}` with no cookie. 404 when sign-in is not configured.
- `POST /auth/signout` clears the cookie.
- Owner-only routes depend on `require_owner` in `owner.py` (401 without a valid session);
  `GET /editor/ping` is the sample one.

Sign-in needs all three of these; without them nobody can sign in and the game is unchanged:

- `GOOGLE_CLIENT_ID`: a Google OAuth "Web application" client with the authorized redirect URI
  `https://punland.interstellarai.net/` (exactly, trailing slash; add `http://localhost:5173/`
  for dev).
- `OWNER_EMAIL`: the owner's Google account. Changing it ends the old session.
- `SESSION_SECRET`: signs the session cookie, e.g.
  `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Changing it ends every session.

The cookie is host-only on the API, so the owner session works on the production site and on
localhost, not on Pages previews (another site, so a SameSite=Strict cookie never goes there).
