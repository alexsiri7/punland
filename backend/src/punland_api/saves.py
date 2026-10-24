"""Autosave: one saved game per anonymous player, kept in Postgres (progress spec, Autosave).

The player is the X-Player-Id header, a UUID the browser makes up and keeps. The save is an
opaque JSON object: the backend never reads the game state, so new state (stats, acts,
dialogue) needs no change here or in the schema.
"""

import datetime as dt
import json
import logging
import uuid
from typing import Annotated, Any

import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from fastapi import APIRouter, Header, HTTPException, Request, Response
from sqlalchemy.dialects import postgresql, sqlite
from starlette.concurrency import run_in_threadpool

logger = logging.getLogger(__name__)

MAX_SAVE_BYTES = 64 * 1024

# Mirrors migrations/versions; unqualified, so it lives in the schema the role's search path
# names (punland / punland_staging).
metadata = sa.MetaData()
saves = sa.Table(
    "saves",
    metadata,
    sa.Column("player_id", sa.Uuid(), primary_key=True),
    sa.Column("game", sa.JSON().with_variant(postgresql.JSONB(), "postgresql"), nullable=False),
    sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
)


def connect(url: str) -> sa.Engine:
    parsed = sa.make_url(url)
    # Supabase hands out postgresql:// URLs, which SQLAlchemy would give to psycopg2.
    if parsed.drivername == "postgresql":
        parsed = parsed.set(drivername="postgresql+psycopg")
    return sa.create_engine(parsed, pool_pre_ping=True)


def migrate(engine: sa.Engine) -> None:
    config = Config()
    config.set_main_option("script_location", "punland_api:migrations")
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")


def load(engine: sa.Engine, player: uuid.UUID) -> dict[str, Any] | None:
    with engine.connect() as connection:
        query = sa.select(saves.c.game).where(saves.c.player_id == player)
        return connection.execute(query).scalar_one_or_none()


def store(engine: sa.Engine, player: uuid.UUID, game: dict[str, Any]) -> None:
    insert = postgresql.insert if engine.dialect.name == "postgresql" else sqlite.insert
    stmt = insert(saves).values(player_id=player, game=game, updated_at=dt.datetime.now(dt.UTC))
    stmt = stmt.on_conflict_do_update(
        index_elements=[saves.c.player_id],
        set_={"game": stmt.excluded.game, "updated_at": stmt.excluded.updated_at},
    )
    with engine.begin() as connection:
        connection.execute(stmt)


def clear(engine: sa.Engine, player: uuid.UUID) -> None:
    with engine.begin() as connection:
        connection.execute(sa.delete(saves).where(saves.c.player_id == player))


router = APIRouter()
Player = Annotated[uuid.UUID, Header(alias="X-Player-Id")]


def _engine(request: Request) -> sa.Engine:
    engine: sa.Engine | None = request.app.state.saves_engine
    if engine is None:
        raise HTTPException(503, "saves are unavailable")
    return engine


def _unavailable() -> HTTPException:
    logger.exception("saves database error")
    return HTTPException(503, "saves are unavailable")


@router.get("/saves")
def get_save(request: Request, player: Player) -> Any:
    try:
        game = load(_engine(request), player)
    except sa.exc.SQLAlchemyError as error:
        raise _unavailable() from error
    # No save is 204, not 404: the browser logs every 404 as a console error.
    return Response(status_code=204) if game is None else game


@router.put("/saves", status_code=204)
async def put_save(request: Request, player: Player) -> None:
    body = bytearray()
    async for chunk in request.stream():
        body += chunk
        if len(body) > MAX_SAVE_BYTES:
            raise HTTPException(413, f"a save is at most {MAX_SAVE_BYTES} bytes")
    try:
        game = json.loads(body)
    except ValueError as error:
        raise HTTPException(422, "a save is a JSON object") from error
    if not isinstance(game, dict):
        raise HTTPException(422, "a save is a JSON object")
    engine = _engine(request)
    try:
        await run_in_threadpool(store, engine, player, game)
    except sa.exc.SQLAlchemyError as error:
        raise _unavailable() from error


@router.delete("/saves", status_code=204)
def delete_save(request: Request, player: Player) -> None:
    try:
        clear(_engine(request), player)
    except sa.exc.SQLAlchemyError as error:
        raise _unavailable() from error
