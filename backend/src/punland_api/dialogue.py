"""POST /dialogue/turn: one improvised line from a character and three suggested replies.

The app, not the model, decides how many suggested replies reach a conversation's goal:
none at first, one after ONE_OPTION_FROM replies, all three after ALL_OPTIONS_FROM. The
model is told which of its replies those are, and picking one reaches the goal.
"""

import asyncio
import json
import logging
from dataclasses import dataclass, field

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from .characters import Character
from .model import Model

ONE_OPTION_FROM = 3
ALL_OPTIONS_FROM = 6
HISTORY_LIMIT = 40
REPLY_MAX = 300

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


class DialogueStore:
    """Conversations per (player, character), held in memory until autosave (#10)."""

    def __init__(self) -> None:
        self._conversations: dict[tuple[str, str], Conversation] = {}
        self._locks: dict[tuple[str, str], asyncio.Lock] = {}

    def lock(self, player: str, character: str) -> asyncio.Lock:
        """Held from get to put, so overlapping turns in one conversation can't lose one."""
        return self._locks.setdefault((player, character), asyncio.Lock())

    def get(self, player: str, character: str) -> Conversation:
        conv = self._conversations.get((player, character))
        if conv is None:
            return Conversation()
        return Conversation(list(conv.history), conv.attempts, conv.goal_reached, conv.offered)

    def put(self, player: str, character: str, conv: Conversation) -> None:
        self._conversations[(player, character)] = conv


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


def router(model: Model, characters: dict[str, Character], store: DialogueStore) -> APIRouter:
    api = APIRouter()

    @api.post("/dialogue/turn")
    async def turn(
        body: TurnRequest,
        player: str = Header(alias="X-Player-Id", min_length=1, max_length=64),
    ) -> TurnAnswer:
        character = characters.get(body.character)
        if character is None:
            raise HTTPException(status_code=404, detail="unknown character")

        async with store.lock(player, character.id):
            conv = store.get(player, character.id)
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
            store.put(player, character.id, conv)
            return TurnAnswer(
                line=line, options=conv.offered, goal_reached=goal_reached, ended=goal_reached
            )

    return api
