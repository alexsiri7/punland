"""POST /dialogue/turn: one improvised line from a character and three suggested replies.

The rules of the conversation are in conversation.py; this route only takes the turn from
HTTP to them and back, keeping the conversation in a DialogueStore between turns.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from . import saves
from .characters import Character
from .conversation import Option, Outcome, canned, conclude, parse_answer, prepare
from .dialogue_store import DialogueStore, TurnAllowance
from .model import Model

REPLY_MAX = 300

log = logging.getLogger(__name__)


class TurnRequest(BaseModel):
    character: str = Field(max_length=40)
    reply: str | None = Field(default=None, max_length=REPLY_MAX)
    # The item ids the cat carries, for the character's must_say lines.
    carrying: list[Annotated[str, Field(max_length=40)]] = Field(
        default_factory=list, max_length=20
    )


class TurnAnswer(BaseModel):
    line: str
    options: list[Option]
    goal_reached: bool
    ended: bool

    @classmethod
    def of(cls, outcome: Outcome) -> "TurnAnswer":
        return cls(
            line=outcome.line,
            options=list(outcome.options),
            goal_reached=outcome.goal_reached,
            ended=outcome.ended,
        )


def router(
    model: Model,
    characters: dict[str, Character],
    store: DialogueStore,
    allowance: TurnAllowance,
) -> APIRouter:
    api = APIRouter()

    @api.post("/dialogue/turn")
    async def turn(body: TurnRequest, player: saves.Player) -> TurnAnswer:
        character = characters.get(body.character)
        if character is None:
            raise HTTPException(status_code=404, detail="unknown character")
        if not allowance.take(player):
            return TurnAnswer.of(canned(character))

        async with store.lock(player, character.id):
            conv = await store.get(player, character.id)
            prompt = prepare(character, conv, body.reply, frozenset(body.carrying))
            try:
                answer = parse_answer(await model(prompt.messages))
            except Exception as exc:
                log.warning("dialogue model failed: %s", type(exc).__name__)
                answer = None
            if answer is None:
                return TurnAnswer.of(canned(character))
            conv, outcome = conclude(conv, prompt, answer)
            await store.put(player, character.id, conv)
            return TurnAnswer.of(outcome)

    return api
