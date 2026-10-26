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

`POST /dialogue/turn` (header `X-Player-Id: <uuid>`, body `{"character", "reply"}`, `reply` null
to start) answers `{"line", "options": [{"text", "reaches_goal"}], "goal_reached", "ended"}`.
Character sheets are content data in `src/punland_api/content/characters/<id>.json`.

- `REQUESTY_API_KEY` is the Requesty key (server-side only); `PUNLAND_DIALOGUE_MODEL` overrides
  the model. Without a key, or when the model fails, the character says its canned line and the
  conversation ends (`ended: true`, no options).
- Each player gets `TURNS_PER_DAY` (100) model-backed turns per UTC day, shared across every
  character and counted in memory (a restart resets them). Past that, every character says its
  canned line and the conversation ends (`ended: true`, no options) until the day turns over.
- Conversations are kept per player and character in the `conversations` table, next to the save;
  `DELETE /saves` (New game) clears them. Without a usable database they are kept in memory.
