"""Entry point: `punland-api` runs uvicorn on $PORT (Railway sets it)."""

import os

import uvicorn


def run() -> None:
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("punland_api.app:app", host="0.0.0.0", port=port, proxy_headers=True)


if __name__ == "__main__":
    run()
