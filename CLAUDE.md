# Punland (Tune Story) — notes for Claude Code

Monkey Island-style point-and-click adventure in the browser. A teenage cat from Literal Village comes to Punland to make it as a musician. Working title **Tune Story**. Specs live in `openspec/specs/` (punland, scenes, inventory, dialogue, worlds, progress); work items are GitHub issues created from Lachesis.

## Look and feel: read docs/design/STYLE.md first

Every new scene, character, prop or piece of UI follows [`docs/design/STYLE.md`](docs/design/STYLE.md). It is the owner's "Tune Story" design canvas, and the source boards are in `docs/design/canvas/`. In short:

- Indie dusk palette. Two tones per material, light from the upper left, hard flat shadows, no outlines on characters, and a grain overlay.
- Bebas Neue for in-world signs and titles, Inter for the UI. Both are self-hosted, never Google Fonts, because of the CSP.
- Each room is one layered 1280 × 640 SVG in `frontend/art/<room>/scene.svg`, rendered with `node scripts/render-art.mjs` to `public/rooms/<room>/`. The UI bar is 160 px under it.

Take colours from `src/presentation/theme.ts` and the CSS variables, not new hex values. The opening pub is **The Three Crows**. The protagonist is **Paws Anka**, a placeholder name chosen 2026-10-24 that may change: it lives only in `frontend/src/content/protagonist.ts`, so read it from there and don't build anything that depends on the exact name.

## Stack

| Part | Tech | Hosted |
| --- | --- | --- |
| `frontend/` | Phaser 4 + Vite + TypeScript. Title screen is DOM; rooms are Phaser scenes in a `#game` container. | Cloudflare Pages project `punland`, git-connected: every push to `main` deploys https://punland.interstellarai.net, and PR branches get preview URLs (`<branch>.punland.pages.dev`). Root dir `frontend`, build `npm run build`, output `dist`. |
| `backend/` | Python 3.12, FastAPI, uvicorn. | Railway project `punland`, service `api`, root dir `/backend`, deploys `main` from GitHub (Dockerfile + `railway.toml`, healthcheck `/health`). Public at https://punland-api.interstellarai.net. |
| Database (from #10) | Postgres on the shared Supabase projects, one schema + role per app: `punland` on Prod (`goxtnasdisqkfrldtbej`), `punland_staging` on Staging (`xhcfolmrdctmtqgqqxec`). Accessed only by the backend, never from the browser. | — |
| AI dialogue (from #6) | Requesty (OpenAI-compatible router), called only by the backend. | — |

Issue #3 originally asked for both parts on Railway. The frontend went to Cloudflare Pages instead (the hosting the owner's other browser games use); the backend stays FastAPI on Railway as the issue says. Don't move either without the owner.

## Commands

```bash
# frontend
cd frontend
npm ci
npm run dev           # Vite dev server on :5173 (talks to a backend on localhost:8000)
npm run typecheck
npm test              # vitest unit tests (tests/unit/)
npm run build         # tsc + vite build -> dist/
npm run test:e2e      # Playwright against dist/ served by tests/serve.mjs with the production _headers
                      # (first time: npx playwright install chromium)

# backend
cd backend
python3 -m venv .venv && . .venv/bin/activate   # or: uv venv && uv pip install -e ".[dev]"
pip install -e ".[dev]"
ruff check . && ruff format --check .
pytest
punland-api           # uvicorn on $PORT (default 8000)
```

CI (`.github/workflows/ci.yml`) runs all of the above plus a Docker build of the backend with a `/health` probe, the unsafe-change checker's own tests, and `openspec validate --specs --strict` (`openspec.yml`). All must be green to merge.

## Architecture: read docs/ARCHITECTURE.md before changing frontend/src

[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) is the target structure (specs: `openspec/specs/architecture`, `openspec/specs/models`). It splits the code into a pure domain and rules layer (commands to state and events), content and a model registry validated by schemas, and presentation behind a renderer interface (Phaser 2D now, Three.js 3D from phase B). It also holds the 3D asset contract for model files. The refactor lands as issues `A1`…`A9`, then the 3D work as `B1`…`B7`. Until they land, the layout below is the current code. Each step updates both this file and ARCHITECTURE.md. Layering is enforced by `tests/unit/architecture.test.ts` (from A1), not by a linter: TypeScript 7 has no JS compiler API for typescript-eslint or dependency-cruiser.

## Layout

```
frontend/
  index.html            title screen markup (Tune Story, New game, Continue); loads src/app/main.ts
  src/domain/           pure model: floor geometry (FloorPoint, walking on a convex floor), content types (content.ts),
                        GameState and newGame (state.ts), Command and GameEvent (commands.ts), SaveGame with toSave/fromSave
                        (save.ts), inventory/journey save state
  src/rules/            pure rules: apply(content, state, command) -> {state, events}, running interactions; isPresent
  src/content/          content data: rooms/<room>.json, items.json, worlds.json, characters.json, objects.json,
                        protagonist.ts; validate.ts checks the files
                        ({file, field, message} problems, branded ids); index.ts loadContent() builds Content or throws
  src/content/rooms/<room>.json  room content: floor, start point, hotspots: a target (a placed character or object, or
                        a scene node), interactions (verb, item, `when` conditions, effects such as say, goTo, pickUp,
                        talk) and `presentWhen` conditions
  src/content/protagonist.ts  the protagonist's (placeholder) name and sprite id, the one place they live in code
  src/services/         api.ts (backend base URL + fetch helpers), save.ts (SaveStore: local + backend; re-exports SaveGame), dialogue.ts
                        (BackendDialogue: POST /dialogue/turn), player.ts, storage.ts
  src/presentation/     renderer.ts (the Renderer interface: SceneView, Pick, AnimationName; no engine imports),
                        theme.ts (design tokens from docs/design/STYLE.md), fonts.ts (self-hosted fonts), style.css,
                        session.ts (the Session interface the UI sees)
  src/presentation/ui/  the DOM UI over the canvas: index.ts mountUi(container, session, renderer, mirror, dialogue), overlay.ts
                        (lines it up with the renderer's canvas), uiBar.ts (label, action line, hint), speech.ts, hotspots.ts,
                        inventory.ts, worlds.ts, dialogue.ts (the conversation panel)
  src/presentation/phaser2d/  the only folder that imports phaser: renderer.ts (Phaser2dRenderer implements Renderer),
                        RoomScene.ts (draws one SceneView from the room's art; no game rules, no text, no input)
  src/app/              main.ts (boot: title screen -> GameSession -> playGame()), game.ts (playGame: the SceneView from the
                        session, canvas clicks -> renderer.pick -> commands, frames -> tick, the UI and mirror),
                        renderers.ts (chooses the renderer: 2D only), title.ts (Continue only when a save exists),
                        session.ts (GameSession: the state, dispatch/subscribe, autosave on `saved`),
                        mirror.ts (data-scene/-world/-player/-hover/-say on #game)
  art/<room>/scene.svg  layered room art (source); scripts/render-art.mjs renders it to public/rooms/<room>/
  public/rooms/<room>/  rendered room art the game loads: background.jpg, <actor>.png, fore.png, poster.jpg, art.json
  public/_headers       production CSP and security headers (Cloudflare Pages)
  tests/unit/           vitest (jsdom); architecture.test.ts enforces the layers, support/layer-baseline.json lists the known
                        violations (none left); fakes/renderer.ts is a Renderer that records calls, for app tests
  tests/e2e/            Playwright; fixtures.ts fails any test on page errors, console errors, CSP violations
  tests/serve.mjs       local stand-in for Pages: serves dist/ with _headers, 404.html for unknown paths
backend/
  src/punland_api/app.py     FastAPI app factory, CORS, /health
  src/punland_api/config.py  settings from env vars
  tests/                     pytest
openspec/specs/         the specs (source of truth for behaviour)
docs/design/            STYLE.md (the look) + canvas/ (the owner's design boards)
```

## Acceptance tests

Acceptance tests come from the specs (issue #2 and later spec changes): one test per spec scenario, against the public interface only.

- Browser behaviour goes in `frontend/tests/e2e/<capability>.spec.ts` (Playwright). Use the `test` and `expect` from `./fixtures`, not straight from `@playwright/test`.
- Backend behaviour goes in `backend/tests/test_<capability>.py` (pytest, `fastapi.testclient.TestClient`).
- Name each test after the scenario, and put the requirement in a comment.
- A test for a scenario that isn't built yet is marked expected-to-fail. It keeps running, and it flips to a failure as soon as it starts passing, so remove the marker in the PR that implements it:
  - Playwright: `test.fail()` as the first line of the test body, or `test.fail(true, 'needs #4')`.
  - vitest: `it.fails(...)`.
  - pytest: `@pytest.mark.xfail(reason="needs #6")`. `xfail_strict` is on.
- Public interface means what a player sees and does (roles, text, `#game[data-scene]`, the HTTP API), not internal modules.

## Invariants

- **Story is content data.** Rooms, hotspots, items, characters, puzzles and acts are data files, not code (progress spec, "Story as content"). Adding a puzzle must not need a code change. Art is a swappable placeholder file per room, and replacing it must not touch game logic.
- **The model key stays on the server.** The browser never calls Requesty or Supabase directly; everything goes through the backend. No secrets in the repo, in `frontend/`, or in `VITE_*` variables, because anything in the frontend build is public.
- **Secrets** come from env vars on Railway, managed in Doppler. Doppler has no free project slot left, so punland's secrets go in configs inside the existing `shared` project (for example `shared/prd_punland`), synced to Railway. `.env` files are gitignored and never committed.
- **AI failures never break the game.** If the AI is unavailable or the per-player turn limit is reached, the character gives a canned in-character line and the conversation ends (dialogue spec).
- **CSP without `'unsafe-inline'`.** No inline `<script>`, `<style>`, `style="..."` or `on*=` handlers. Setting `element.style.x` from JS is fine. `connect-src` allows only `'self'` and the API origin. A new origin, or any other header change, needs a matching `frontend/public/_headers` edit, and that edit needs the owner's review.
- **Only build output is served.** Cloudflare Pages serves `frontend/dist/`. Tests, docs and tooling never go into `frontend/public/`.
- **CORS** on the backend allows the production site, `punland.pages.dev` and its preview subdomains (`config.py`), plus localhost outside production. Don't widen it to `*`.
- **Database:** the app touches only its own schema (`punland` / `punland_staging`). No GRANTs, roles, RLS or search_path changes in migrations. Never write to the production database by hand.
- **Desktop browser first** (punland spec). Keep the title screen and the game usable at 960×540 and above.
- For any UI change, run `npm run test:e2e` and look at a screenshot (`await page.screenshot({ path: '/tmp/punland.png' })`), not just the exit code.

## Factory (Archon)

The Archon factory works on this repo: issue pickup, PR review and PR maintenance. A PR for an issue vetted only by the factory's automated screening (`archon:auto-approved`) must pass the `unsafe-change` check (`.github/unsafe-change.yml`). That check holds the following for the owner: changes to CI, `CLAUDE.md`, `frontend/public/_headers` and other Pages routing files, the e2e gate (`tests/serve.mjs`, `tests/e2e/fixtures.ts`, `playwright.config.ts`), `vite.config.ts`, the backend's `config.py`, Docker/Railway config, new dependencies, and new uses of env vars, processes or sockets. Game code, content data, styles and tests pass. Add the `hold` label to park a PR.
