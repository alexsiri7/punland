# punland

Monkey Island-style adventure game: a young animal comes to Punland to make it as a musician. AI-improvised dialogue, puzzles across three worlds (city, online, songwriting dream), multiple endings.

Working title **Tune Story**. Play it at https://punland.interstellarai.net.

- `frontend/`: the game (Phaser + Vite + TypeScript), on Cloudflare Pages.
- `backend/`: the API (FastAPI), on Railway at https://punland-api.interstellarai.net. It keeps autosaves, AI dialogue and turn limits.
- `openspec/specs/`: what the game does.

See [CLAUDE.md](CLAUDE.md) for commands, deploy and invariants.
