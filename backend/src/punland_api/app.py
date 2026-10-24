"""FastAPI application factory."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__, dialogue
from .characters import load_characters
from .config import Settings
from .model import Model, model_from_settings


def create_app(settings: Settings | None = None, model: Model | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    app = FastAPI(
        title="Tune Story API",
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

    app.include_router(
        dialogue.router(
            model or model_from_settings(settings), load_characters(), dialogue.DialogueStore()
        )
    )

    return app


app = create_app()
