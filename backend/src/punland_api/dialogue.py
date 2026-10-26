"""POST /dialogue/turn: one improvised line from a character and three suggested replies.

The app, not the model, decides how many suggested replies reach a conversation's goal:
none at first, one after ONE_OPTION_FROM replies, all three after ALL_OPTIONS_FROM. The
model is told which of its replies those are, and picking one reaches the goal.

Each player gets TURNS_PER_DAY model-backed turns per UTC day (dialogue spec, Spending
limits); after that every character answers with its canned line and the conversation ends.
"""

import asyncio
import datetime as dt
import json
import logging
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import sqlalchemy as sa
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.dialects import postgresql, sqlite
from starlette.concurrency import run_in_threadpool

from . import saves
from .characters import Character
from .model import Model

ONE_OPTION_FROM = 3
ALL_OPTIONS_FROM = 6
HISTORY_LIMIT = 40
REPLY_MAX = 300
TURNS_PER_DAY = 100

THE_CAT = (
    "You are talking to a teenage cat from Literal Village, new in Punland, "
    "who wants to make it as a musician."
)
ANSWER_FORMAT = (
    "Answer only with JSON: "
    '{"line": "<what you say>", "options": ["<reply>", "<reply>", "<reply>"], '
    '"goal_reached": false}. The options are three short replies the cat could say next.'
)

log = logging.getLogger(__name__)


class TurnRequest(BaseModel):
    character: str = Field(max_length=40)
    reply: str | None = Field(default=None, max_length=REPLY_MAX)


class Option(BaseModel):
    text: str
    reaches_goal: bool


class TurnAnswer(BaseModel):
    line: str
    options: list[Option]
    goal_reached: bool
    ended: bool


@dataclass
class Conversation:
    history: list[dict[str, str]] = field(default_factory=list)
    attempts: int = 0
    goal_reached: bool = False
    offered: list[Option] = field(default_factory=list)

    def to_state(self) -> dict[str, Any]:
        return {
            "history": [dict(entry) for entry in self.history],
            "attempts": self.attempts,
            "goal_reached": self.goal_reached,
            "offered": [o.model_dump() for o in self.offered],
        }

    @classmethod
    def from_state(cls, state: dict[str, Any]) -> "Conversation":
        return cls(
            history=[{"speaker": e["speaker"], "text": e["text"]} for e in state["history"]],
            attempts=int(state["attempts"]),
            goal_reached=bool(state["goal_reached"]),
            offered=[Option.model_validate(o) for o in state["offered"]],
        )


class DialogueStore:
    """Conversations per (player, character), kept in the database next to the player's save.

    Without a usable database (none configured, or an error on this call) they are kept in
    memory instead, so the dialogue never fails because the database does.
    """

    def __init__(self) -> None:
        self._memory: dict[tuple[uuid.UUID, str], Conversation] = {}
        self._locks: dict[tuple[uuid.UUID, str], asyncio.Lock] = {}

    def lock(self, player: uuid.UUID, character: str) -> asyncio.Lock:
        """Held from get to put, so overlapping turns in one conversation can't lose one."""
        return self._locks.setdefault((player, character), asyncio.Lock())

    async def get(
        self, engine: sa.Engine | None, player: uuid.UUID, character: str
    ) -> Conversation:
        if engine is not None:
            try:
                state = await run_in_threadpool(_load, engine, player, character)
                return Conversation.from_state(state) if state is not None else Conversation()
            except (sa.exc.SQLAlchemyError, ValueError, KeyError, TypeError):
                log.exception("conversation not loaded; using memory")
        conv = self._memory.get((player, character))
        if conv is None:
            return Conversation()
        return Conversation.from_state(conv.to_state())

    async def put(
        self, engine: sa.Engine | None, player: uuid.UUID, character: str, conv: Conversation
    ) -> None:
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
    table = saves.conversations
    insert = postgresql.insert if engine.dialect.name == "postgresql" else sqlite.insert
    stmt = insert(table).values(
        player_id=player, character=character, state=state, updated_at=dt.datetime.now(dt.UTC)
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=[table.c.player_id, table.c.character],
        set_={"state": stmt.excluded.state, "updated_at": stmt.excluded.updated_at},
    )
    with engine.begin() as connection:
        connection.execute(stmt)


def goal_options(attempts: int) -> int:
    if attempts >= ALL_OPTIONS_FROM:
        return 3
    if attempts >= ONE_OPTION_FROM:
        return 1
    return 0


def build_messages(
    character: Character,
    conv: Conversation,
    reply: str | None,
    goal_open: bool,
    n: int,
    conceding: bool,
) -> list[dict[str, str]]:
    system = [character.sheet, THE_CAT, "Stay in character; say one or two sentences."]
    if goal_open:
        system.append(f"The cat wants you to {character.goal}.")
        if conceding:
            system.append(f"The cat's reply wins you over: agree to {character.goal} now.")
        elif n:
            system.append(
                f"Exactly the last {n} of your 3 suggested replies would make you agree; "
                "the others must not."
            )
        else:
            system.append("None of your 3 suggested replies may make you agree.")
        if reply is not None and not conceding:
            system.append(
                "Set goal_reached to true only if the cat's last reply would genuinely "
                "make you agree."
            )
    system.append(ANSWER_FORMAT)

    messages = [{"role": "system", "content": "\n".join(system)}]
    for entry in conv.history:
        role = "user" if entry["speaker"] == "cat" else "assistant"
        messages.append({"role": role, "content": entry["text"]})
    if reply is not None:
        messages.append({"role": "user", "content": reply})
    elif conv.history:
        messages.append({"role": "user", "content": "(The cat comes back to talk to you again.)"})
    else:
        messages.append({"role": "user", "content": "(The cat walks up to you.)"})
    return messages


def parse_answer(text: str) -> tuple[str, list[str], bool] | None:
    try:
        data = json.loads(text[text.index("{") : text.rindex("}") + 1])
    except ValueError:
        return None
    if not isinstance(data, dict):
        return None
    line, options = data.get("line"), data.get("options")
    if not isinstance(line, str) or not line.strip():
        return None
    if not isinstance(options, list) or len(options) < 3:
        return None
    options = options[:3]
    if not all(isinstance(o, str) and o.strip() for o in options):
        return None
    return line.strip(), [o.strip() for o in options], data.get("goal_reached") is True


def router(
    model: Model,
    characters: dict[str, Character],
    store: DialogueStore,
    allowance: TurnAllowance,
) -> APIRouter:
    api = APIRouter()

    @api.post("/dialogue/turn")
    async def turn(body: TurnRequest, request: Request, player: saves.Player) -> TurnAnswer:
        character = characters.get(body.character)
        if character is None:
            raise HTTPException(status_code=404, detail="unknown character")
        if not allowance.take(player):
            return TurnAnswer(line=character.canned, options=[], goal_reached=False, ended=True)

        async with store.lock(player, character.id):
            engine: sa.Engine | None = getattr(request.app.state, "saves_engine", None)
            conv = await store.get(engine, player, character.id)
            goal_open = character.goal is not None and not conv.goal_reached
            reply = body.reply.strip() if body.reply is not None else None
            picked = next((o for o in conv.offered if o.text == reply), None)
            conceding = goal_open and picked is not None and picked.reaches_goal
            if reply is not None and goal_open:
                conv.attempts += 1
            n = goal_options(conv.attempts) if goal_open and not conceding else 0

            try:
                answer = parse_answer(
                    await model(build_messages(character, conv, reply, goal_open, n, conceding))
                )
            except Exception as exc:
                log.warning("dialogue model failed: %s", type(exc).__name__)
                answer = None
            if answer is None:
                return TurnAnswer(line=character.canned, options=[], goal_reached=False, ended=True)
            line, texts, model_says_reached = answer

            goal_reached = conceding or (
                goal_open and reply is not None and picked is None and model_says_reached
            )
            if reply is not None:
                conv.history.append({"speaker": "cat", "text": reply})
            conv.history.append({"speaker": "character", "text": line})
            conv.history = conv.history[-HISTORY_LIMIT:]

            if goal_reached:
                conv.goal_reached = True
                conv.offered = []
            else:
                conv.offered = [
                    Option(text=text, reaches_goal=i >= 3 - n) for i, text in enumerate(texts)
                ]
            await store.put(engine, player, character.id, conv)
            return TurnAnswer(
                line=line, options=conv.offered, goal_reached=goal_reached, ended=goal_reached
            )

    return api
