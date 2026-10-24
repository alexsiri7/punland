"""FastAPI application factory."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__, saves
from .config import Settings

logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        # A database that is missing, down or fails to migrate disables saves (503), never the
        # API: the game keeps its saves in the browser meanwhile.
        app.state.saves_engine = None
        engine = saves.connect(settings.database_url) if settings.database_url else None
        if engine is not None:
            try:
                saves.migrate(engine)
                app.state.saves_engine = engine
            except Exception:
                logger.exception("autosave disabled: database unavailable or migration failed")
        yield
        if engine is not None:
            engine.dispose()

    app = FastAPI(
        title="Tune Story API",
        lifespan=lifespan,
        version=__version__,
        docs_url=None if settings.environment == "production" else "/docs",
        redoc_url=None,
        openapi_url=None if settings.environment == "production" else "/openapi.json",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_origin_regex=settings.cors_origin_regex,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Content-Type", "X-Player-Id"],
        max_age=600,
    )

    @app.get("/health")
    async def health() -> dict[str, str]:
        """Liveness check used by Railway and pipeline-health."""
        return {"status": "ok", "version": __version__}

    app.include_router(saves.router)
    return app


app = create_app()
