# punland-api

FastAPI backend for Tune Story. See the repository's `CLAUDE.md` for commands and deploy.

## Saves

`GET`, `PUT` and `DELETE /saves` keep one autosave per anonymous player (header
`X-Player-Id: <uuid>`). The save is an opaque JSON object of at most 64 KiB; `GET` answers 204
when there is none.

- `DATABASE_URL` is the Postgres URL, authenticating as the app's own role (`punland`, or
  `punland_staging` on staging) through the session pooler on port 5432. Don't add
  `options=-c search_path=...`: the role's own search path picks its schema.
- Without `DATABASE_URL`, or when the database is down or a migration fails at startup, `/saves`
  answers 503 and the rest of the API keeps running. The game falls back to the save in the
  browser.
- Migrations (Alembic) live in `src/punland_api/migrations/versions/` and run at startup. To add
  one, copy `0001_saves.py` and chain `revision`/`down_revision`. Use unqualified table names and
  plain `import a.b as c` lines: the unsafe-change check reads every added line under
  `migrations/` as SQL.
