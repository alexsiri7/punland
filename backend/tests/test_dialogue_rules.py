"""How POST /dialogue/turn decides goals and failures, beyond the spec scenarios."""

import asyncio
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from punland_api.app import create_app
from punland_api.characters import load_characters
from punland_api.config import Settings
from punland_api.model import RequestyModel

PLAYER = {"X-Player-Id": "test-player"}
GOAL = "let the cat downstairs to play at the open mic"


class ScriptedModel:
    def __init__(self, answer: object) -> None:
        self.answer = answer
        self.calls: list[list[dict[str, str]]] = []

    async def __call__(self, messages: list[dict[str, str]]) -> str:
        self.calls.append(messages)
        return self.answer if isinstance(self.answer, str) else json.dumps(self.answer)


def answer(goal_reached: bool = False) -> dict:
    return {"line": "Hm.", "options": ["One.", "Two.", "Three."], "goal_reached": goal_reached}


def turn(client: TestClient, character: str, reply: str | None = None) -> dict:
    res = client.post(
        "/dialogue/turn", headers=PLAYER, json={"character": character, "reply": reply}
    )
    assert res.status_code == 200
    return res.json()


def reaching(result: dict) -> list[str]:
    return [o["text"] for o in result["options"] if o["reaches_goal"]]


def test_picking_a_goal_option_reaches_the_goal() -> None:
    model = ScriptedModel(answer())
    client = TestClient(create_app(Settings(), model=model))
    latest = turn(client, "bouncer")
    while not reaching(latest):
        latest = turn(client, "bouncer", "Hello?")
    assert reaching(latest) == ["Three."]

    won = turn(client, "bouncer", "Three.")
    assert won == {"line": "Hm.", "options": [], "goal_reached": True, "ended": True}

    model.calls.clear()
    again = turn(client, "bouncer")
    assert reaching(again) == []
    assert GOAL not in model.calls[0][0]["content"]


def test_all_three_reach_the_goal_eventually() -> None:
    client = TestClient(create_app(Settings(), model=ScriptedModel(answer())))
    turn(client, "bouncer")
    counts = [len(reaching(turn(client, "bouncer", "Hello?"))) for _ in range(6)]
    assert counts == [0, 0, 1, 1, 1, 3]


def test_typed_reply_judged_by_model() -> None:
    client = TestClient(create_app(Settings(), model=ScriptedModel(answer(goal_reached=True))))
    turn(client, "bouncer")
    picked = turn(client, "bouncer", "One.")
    assert picked["goal_reached"] is False
    typed = turn(client, "bouncer", "I'm the band.")
    assert typed["goal_reached"] is True
    assert typed["ended"] is True


@pytest.mark.parametrize(
    "raw", ["not json", json.dumps({"line": "Hm.", "options": ["One.", "Two."]})]
)
def test_malformed_answer_gives_canned_line(raw: str) -> None:
    client = TestClient(create_app(Settings(), model=ScriptedModel(raw)))
    result = turn(client, "bartender")
    assert result["line"].strip() and result["line"] != "Hm."
    assert result["ended"] is True
    assert result["options"] == []


def test_unknown_character_is_404() -> None:
    client = TestClient(create_app(Settings(), model=ScriptedModel(answer())))
    res = client.post("/dialogue/turn", headers=PLAYER, json={"character": "nobody"})
    assert res.status_code == 404


def test_without_a_key_the_character_gives_canned_line() -> None:
    client = TestClient(create_app(Settings()))
    result = turn(client, "bartender")
    assert result["ended"] is True
    assert result["options"] == []


def test_requesty_model_request() -> None:
    seen: list[httpx.Request] = []

    def ok(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"choices": [{"message": {"content": "{}"}}]})

    messages = [{"role": "user", "content": "Hi."}]
    model = RequestyModel("k", "some/model", "https://router.example/v1", httpx.MockTransport(ok))
    assert asyncio.run(model(messages)) == "{}"
    assert seen[0].method == "POST"
    assert str(seen[0].url) == "https://router.example/v1/chat/completions"
    assert seen[0].headers["Authorization"] == "Bearer k"
    body = json.loads(seen[0].content)
    assert body["model"] == "some/model"
    assert body["messages"] == messages

    failing = RequestyModel(
        "k",
        "some/model",
        "https://router.example/v1",
        httpx.MockTransport(lambda _: httpx.Response(500)),
    )
    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(failing(messages))


def test_character_content_loads() -> None:
    characters = load_characters()
    assert {"bartender", "bouncer"} <= characters.keys()
    assert characters["bartender"].goal is None
    assert characters["bouncer"].goal == GOAL


def test_answer_matches_the_frontend_wire_shape() -> None:
    # frontend/tests/e2e/play.ts declares the same answer as DialogueTurn; keep them in step.
    client = TestClient(create_app(Settings(), model=ScriptedModel(answer())))
    result = turn(client, "bouncer")
    assert result.keys() == {"line", "options", "goal_reached", "ended"}
    assert [o.keys() for o in result["options"]] == [{"text", "reaches_goal"}] * 3


def test_players_have_their_own_conversations() -> None:
    model = ScriptedModel(answer())
    client = TestClient(create_app(Settings(), model=model))
    turn(client, "bouncer")
    for _ in range(3):
        turn(client, "bouncer", "I play the kazoo.")

    model.calls.clear()
    other = client.post(
        "/dialogue/turn", headers={"X-Player-Id": "other-player"}, json={"character": "bouncer"}
    ).json()
    assert reaching(other) == []
    assert not any("kazoo" in m["content"] for m in model.calls[0])


class SlowModel(ScriptedModel):
    async def __call__(self, messages: list[dict[str, str]]) -> str:
        await asyncio.sleep(0.05)
        return await super().__call__(messages)


def test_overlapping_turns_are_both_remembered() -> None:
    model = SlowModel(answer())
    app = create_app(Settings(), model=model)

    async def overlap() -> dict:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:

            async def send(reply: str | None) -> dict:
                res = await client.post(
                    "/dialogue/turn", headers=PLAYER, json={"character": "bouncer", "reply": reply}
                )
                assert res.status_code == 200
                return res.json()

            await send(None)
            await asyncio.gather(send("I play the kazoo."), send("I play the tuba."))
            model.calls.clear()
            return await send("Hello?")

    third = asyncio.run(overlap())
    assert len(reaching(third)) == 1
    said = [m["content"] for m in model.calls[0]]
    assert "I play the kazoo." in said and "I play the tuba." in said
