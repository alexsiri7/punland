"""Acceptance tests for openspec/specs/dialogue/spec.md, the backend's side (#6, #7).

The game talks to POST /dialogue/turn with the player's anonymous id in X-Player-Id and
{"character": <id>, "reply": <text, or null to start>}; the answer is
{"line", "options": [{"text", "reaches_goal"}], "goal_reached", "ended"}.

The model is replaced by a fake that records the chat messages it is sent and answers in
the JSON the dialogue prompt asks for, {"line", "options": [three strings], "goal_reached"};
the app is given it as create_app(settings, model=<async callable: messages -> str>).
"""

import json

from fastapi.testclient import TestClient

from punland_api.app import create_app
from punland_api.config import Settings

PLAYER = {"X-Player-Id": "6f1c0e2a-4b7d-4c1e-9a53-2d8e7f0b1c94"}
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
    turn(client, "cop")
    turn(client, "cop", "I play the kazoo, by the way.")

    model.calls.clear()
    turn(client, "cop")
    assert any("kazoo" in message["content"] for message in model.calls[0])


def test_ai_unavailable() -> None:
    # Requirement: Leaving and failure. If the AI is unavailable the character says so in
    # character and the conversation ends, without an error the game would have to handle.
    client = dialogue_client(UnreachableModel())
    answer = turn(client, "cop")
    assert answer["line"].strip()
    assert answer["ended"] is True
    assert answer["options"] == []


def test_limit_reached() -> None:
    # Requirement: Spending limits. A player's AI dialogue turns are limited per period;
    # at the limit the character ends the conversation with a canned line.
    model = FakeModel()
    client = dialogue_client(model)
    answer = turn(client, "cop")
    for _ in range(1000):
        if answer["ended"]:
            break
        answer = turn(client, "cop", "Tell me more.")
    assert answer["ended"] is True
    assert answer["line"].strip() and answer["line"] != "Hm."

    calls = len(model.calls)
    again = turn(client, "cop")
    assert again["ended"] is True
    assert len(model.calls) == calls


def system_prompt(model: FakeModel) -> str:
    return model.calls[-1][0]["content"]


def test_talking_to_the_beetroot_cop() -> None:
    # Requirement: Act 1 conversations. The beetroot cop says the music stars go to The
    # Three Crows, and so does his canned line when the AI is unavailable.
    model = FakeModel()
    turn(dialogue_client(model), "cop")
    assert "beetroot" in system_prompt(model)
    assert "music stars go to The Three Crows" in system_prompt(model)
    assert "The Three Crows" in turn(dialogue_client(UnreachableModel()), "cop")["line"]


def test_talking_to_a_crow() -> None:
    # Requirement: Act 1 conversations. Each crow states its condition; one is Sheryl Caw.
    conditions = {
        "sheryl-caw": "a working guitar",
        "second-crow": "a good song of the cat's own",
        "third-crow": "someone who lives in Punland",
    }
    for crow, condition in conditions.items():
        model = FakeModel()
        first = turn(dialogue_client(model), crow)
        assert condition in system_prompt(model)
        assert not any(option["reaches_goal"] for option in first["options"])
    model = FakeModel()
    turn(dialogue_client(model), "sheryl-caw")
    assert "Sheryl Caw" in system_prompt(model)
    refusal = turn(dialogue_client(UnreachableModel()), "third-crow")["line"]
    assert "I won't vouch for you" in refusal


def test_convincing_the_bartender() -> None:
    # Requirement: Act 1 conversations. The bartender's conversation has a goal: the cat
    # convinces her he's staying, and picking a reply that reaches it reaches the goal.
    model = FakeModel()
    client = dialogue_client(model)
    latest = turn(client, "bartender")
    assert "kitchen" in system_prompt(model) and "third crow" in system_prompt(model)
    for attempt in range(10):
        if any(option["reaches_goal"] for option in latest["options"]):
            break
        latest = turn(client, "bartender", NEVER_REACHES[attempt % 3])
    reaching = next(option for option in latest["options"] if option["reaches_goal"])
    assert turn(client, "bartender", reaching["text"])["goal_reached"] is True
