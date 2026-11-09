"""What the dialogue route keeps between turns: conversations and the players' turn allowance.

Each player gets TURNS_PER_DAY model-backed turns per UTC day (dialogue spec, Spending
limits); after that every character answers with its canned line and the conversation ends.
"""

import asyncio
import datetime as dt
import logging
import uuid
from collections.abc import Callable
from typing import Any

import sqlalchemy as sa
from starlette.concurrency import run_in_threadpool

from . import saves
from .conversation import Conversation

TURNS_PER_DAY = 100

log = logging.getLogger(__name__)


class DialogueStore:
    """Conversations per (player, character), kept in the database next to the player's save.

    Without a usable database (none configured, or an error on this call) they are kept in
    memory instead, so the dialogue never fails because the database does.
    """

    def __init__(self, engine: Callable[[], sa.Engine | None]) -> None:
        """engine gives the database as of each call: the app only connects once it starts."""
        self._engine = engine
        self._memory: dict[tuple[uuid.UUID, str], Conversation] = {}
        self._locks: dict[tuple[uuid.UUID, str], asyncio.Lock] = {}

    def lock(self, player: uuid.UUID, character: str) -> asyncio.Lock:
        """Held from get to put, so overlapping turns in one conversation can't lose one."""
        return self._locks.setdefault((player, character), asyncio.Lock())

    async def get(self, player: uuid.UUID, character: str) -> Conversation:
        engine = self._engine()
        if engine is not None:
            try:
                state = await run_in_threadpool(_load, engine, player, character)
                return Conversation.from_state(state) if state is not None else Conversation()
            except (sa.exc.SQLAlchemyError, ValueError, KeyError, TypeError):
                log.exception("conversation not loaded; using memory")
        return self._memory.get((player, character), Conversation())

    async def put(self, player: uuid.UUID, character: str, conv: Conversation) -> None:
        engine = self._engine()
        if engine is not None:
            try:
                await run_in_threadpool(_store, engine, player, character, conv.to_state())
                return
            except sa.exc.SQLAlchemyError:
                log.exception("conversation not stored; keeping it in memory")
        self._memory[(player, character)] = conv


class TurnAllowance:
    """AI dialogue turns per player per UTC day (dialogue spec, Spending limits).

    Kept in memory: the API is one process, and the player id is the browser's own, so this
    bounds spending per player, not a hard cap (that is Requesty's spending limit).
    """

    def __init__(
        self,
        per_day: int = TURNS_PER_DAY,
        today: Callable[[], dt.date] = lambda: dt.datetime.now(dt.UTC).date(),
    ) -> None:
        self._per_day = per_day
        self._today = today
        self._day: dt.date | None = None
        self._used: dict[uuid.UUID, int] = {}

    def take(self, player: uuid.UUID) -> bool:
        """Use one of the player's turns today; False once they have none left.

        Synchronous on purpose: check and increment can't interleave on the event loop.
        """
        day = self._today()
        if day != self._day:
            self._day, self._used = day, {}
        used = self._used.get(player, 0)
        if used >= self._per_day:
            return False
        self._used[player] = used + 1
        return True


def _load(engine: sa.Engine, player: uuid.UUID, character: str) -> dict[str, Any] | None:
    table = saves.conversations
    query = sa.select(table.c.state).where(
        table.c.player_id == player, table.c.character == character
    )
    with engine.connect() as connection:
        return connection.execute(query).scalar_one_or_none()


def _store(engine: sa.Engine, player: uuid.UUID, character: str, state: dict[str, Any]) -> None:
    saves.upsert(
        engine, saves.conversations, {"player_id": player, "character": character, "state": state}
    )
