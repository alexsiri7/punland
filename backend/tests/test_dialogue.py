"""Acceptance tests for openspec/specs/dialogue/spec.md, the backend's side (#6, #7).

The game talks to POST /dialogue/turn with the player's anonymous id in X-Player-Id and
{"character": <id>, "reply": <text, or null to start>}; the answer is
{"line", "options": [{"text", "reaches_goal"}], "goal_reached", "ended"}.

The model is replaced by a fake that records the chat messages it is sent and answers in
the JSON the dialogue prompt asks for, {"line", "options": [three strings], "goal_reached"};
the app is given it as create_app(settings, model=<async callable: messages -> str>).
"""

import json

import pytest
from fastapi.testclient import TestClient

from punland_api.app import create_app
from punland_api.config import Settings

PLAYER = {"X-Player-Id": "test-player"}
NEVER_REACHES = ["I like your hat.", "Nice night for it.", "Is that a new door?"]


class FakeModel:
    def __init__(self) -> None:
        self.calls: list[list[dict[str, str]]] = []

    async def __call__(self, messages: list[dict[str, str]]) -> str:
        self.calls.append(messages)
        return json.dumps({"line": "Hm.", "options": NEVER_REACHES})


class UnreachableModel:
    async def __call__(self, messages: list[dict[str, str]]) -> str:
        raise ConnectionError("model unreachable")


def dialogue_client(model: object) -> TestClient:
    return TestClient(create_app(Settings(), model=model))


def turn(client: TestClient, character: str, reply: str | None = None) -> dict:
    res = client.post(
        "/dialogue/turn", headers=PLAYER, json={"character": character, "reply": reply}
    )
    assert res.status_code == 200
    return res.json()


def test_escalating_options() -> None:
    # Requirement: Conversation goals. Suggested replies lean further towards the goal the
    # more the player tries: none at first, later at least one.
    client = dialogue_client(FakeModel())
    first = turn(client, "bouncer")
    assert len(first["options"]) == 3
    assert not any(option["reaches_goal"] for option in first["options"])

    latest = first
    for attempt in range(10):
        latest = turn(client, "bouncer", NEVER_REACHES[attempt % 3])
        if any(option["reaches_goal"] for option in latest["options"]):
            break
    assert any(option["reaches_goal"] for option in latest["options"])


def test_coming_back() -> None:
    # Requirement: Characters remember. A character remembers earlier conversations in the
    # same game.
    model = FakeModel()
    client = dialogue_client(model)
    turn(client, "bartender")
    turn(client, "bartender", "I play the kazoo, by the way.")

    model.calls.clear()
    turn(client, "bartender")
    assert any("kazoo" in message["content"] for message in model.calls[0])


def test_ai_unavailable() -> None:
    # Requirement: Leaving and failure. If the AI is unavailable the character says so in
    # character and the conversation ends, without an error the game would have to handle.
    client = dialogue_client(UnreachableModel())
    answer = turn(client, "bartender")
    assert answer["line"].strip()
    assert answer["ended"] is True
    assert answer["options"] == []


@pytest.mark.xfail(reason="needs #7")
def test_limit_reached() -> None:
    # Requirement: Spending limits. A player's AI dialogue turns are limited per period;
    # at the limit the character ends the conversation with a canned line.
    model = FakeModel()
    client = dialogue_client(model)
    answer = turn(client, "bartender")
    for _ in range(1000):
        if answer["ended"]:
            break
        answer = turn(client, "bartender", "Tell me more.")
    assert answer["ended"] is True
    assert answer["line"].strip() and answer["line"] != "Hm."

    calls = len(model.calls)
    again = turn(client, "bartender")
    assert again["ended"] is True
    assert len(model.calls) == calls
