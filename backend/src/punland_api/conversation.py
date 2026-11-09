"""The rules of a conversation with a character, apart from HTTP and storage.

The app, not the model, decides how many suggested replies reach a conversation's goal:
none at first, one after ONE_OPTION_FROM replies, all three after ALL_OPTIONS_FROM. The
model is told which of its replies those are, and picking one reaches the goal.

A turn is prepare (the prompt for the model), the model's answer, then conclude (the
conversation after the turn and what the player sees). Neither changes the conversation
it is given.
"""

import json
from dataclasses import dataclass, replace
from typing import Any

from .characters import Character

ONE_OPTION_FROM = 3
ALL_OPTIONS_FROM = 6
HISTORY_LIMIT = 40

THE_CAT = (
    "You are talking to a teenage cat from Literal Village, new in Punland, "
    "who wants to make it as a musician."
)
ANSWER_FORMAT = (
    "Answer only with JSON: "
    '{"line": "<what you say>", "options": ["<reply>", "<reply>", "<reply>"], '
    '"goal_reached": false}. The options are three short replies the cat could say next.'
)


@dataclass(frozen=True)
class Option:
    text: str
    reaches_goal: bool


@dataclass(frozen=True)
class Conversation:
    history: tuple[dict[str, str], ...] = ()
    attempts: int = 0
    goal_reached: bool = False
    offered: tuple[Option, ...] = ()

    def to_state(self) -> dict[str, Any]:
        return {
            "history": [dict(entry) for entry in self.history],
            "attempts": self.attempts,
            "goal_reached": self.goal_reached,
            "offered": [{"text": o.text, "reaches_goal": o.reaches_goal} for o in self.offered],
        }

    @classmethod
    def from_state(cls, state: dict[str, Any]) -> "Conversation":
        return cls(
            history=tuple({"speaker": e["speaker"], "text": e["text"]} for e in state["history"]),
            attempts=int(state["attempts"]),
            goal_reached=bool(state["goal_reached"]),
            offered=tuple(
                Option(text=str(o["text"]), reaches_goal=bool(o["reaches_goal"]))
                for o in state["offered"]
            ),
        )


@dataclass(frozen=True)
class Prompt:
    reply: str | None
    goal_open: bool
    picked: Option | None
    conceding: bool
    attempts: int
    reaching: int
    messages: list[dict[str, str]]


@dataclass(frozen=True)
class Answer:
    line: str
    options: tuple[str, str, str]
    goal_reached: bool


@dataclass(frozen=True)
class Outcome:
    line: str
    options: tuple[Option, ...]
    goal_reached: bool
    ended: bool


def canned(character: Character) -> Outcome:
    """The character's fallback line, which ends the conversation (dialogue spec)."""
    return Outcome(line=character.canned, options=(), goal_reached=False, ended=True)


def goal_options(attempts: int) -> int:
    if attempts >= ALL_OPTIONS_FROM:
        return 3
    if attempts >= ONE_OPTION_FROM:
        return 1
    return 0


def prepare(character: Character, conv: Conversation, reply: str | None) -> Prompt:
    goal_open = character.goal is not None and not conv.goal_reached
    reply = reply.strip() if reply is not None else None
    picked = next((o for o in conv.offered if o.text == reply), None)
    conceding = goal_open and picked is not None and picked.reaches_goal
    attempts = conv.attempts + 1 if reply is not None and goal_open else conv.attempts
    n = goal_options(attempts) if goal_open and not conceding else 0
    return Prompt(
        reply=reply,
        goal_open=goal_open,
        picked=picked,
        conceding=conceding,
        attempts=attempts,
        reaching=n,
        messages=build_messages(character, conv, reply, goal_open, n, conceding),
    )


def conclude(conv: Conversation, prompt: Prompt, answer: Answer) -> tuple[Conversation, Outcome]:
    reply = prompt.reply
    goal_reached = prompt.conceding or (
        prompt.goal_open and reply is not None and prompt.picked is None and answer.goal_reached
    )
    history = list(conv.history)
    if reply is not None:
        history.append({"speaker": "cat", "text": reply})
    history.append({"speaker": "character", "text": answer.line})

    offered: tuple[Option, ...] = ()
    if not goal_reached:
        offered = tuple(
            Option(text=text, reaches_goal=i >= 3 - prompt.reaching)
            for i, text in enumerate(answer.options)
        )
    after = replace(
        conv,
        history=tuple(history[-HISTORY_LIMIT:]),
        attempts=prompt.attempts,
        goal_reached=conv.goal_reached or goal_reached,
        offered=offered,
    )
    return after, Outcome(
        line=answer.line, options=offered, goal_reached=goal_reached, ended=goal_reached
    )


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


def parse_answer(text: str) -> Answer | None:
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
    first, second, third = options[:3]
    if not all(isinstance(o, str) and o.strip() for o in (first, second, third)):
        return None
    return Answer(
        line=line.strip(),
        options=(first.strip(), second.strip(), third.strip()),
        goal_reached=data.get("goal_reached") is True,
    )
