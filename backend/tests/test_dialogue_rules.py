"""How POST /dialogue/turn decides goals and failures, beyond the spec scenarios."""

import asyncio
import datetime as dt
import json
import uuid
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from punland_api import dialogue
from punland_api.app import create_app
from punland_api.characters import load_characters
from punland_api.config import Settings
from punland_api.model import RequestyModel

PLAYER = {"X-Player-Id": "6f1c0e2a-4b7d-4c1e-9a53-2d8e7f0b1c94"}
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
        "/dialogue/turn",
        headers={"X-Player-Id": "0b9d4a77-1e2f-4c3a-8b6d-5e4f3a2c1d0e"},
        json={"character": "bouncer"},
    ).json()
    assert reaching(other) == []
    assert not any("kazoo" in m["content"] for m in model.calls[0])


def test_turn_allowance_is_per_player_and_resets_each_day() -> None:
    day = dt.date(2026, 10, 26)
    allowance = dialogue.TurnAllowance(per_day=2, today=lambda: day)
    a, b = uuid.uuid4(), uuid.uuid4()
    assert [allowance.take(a) for _ in range(3)] == [True, True, False]
    assert allowance.take(b) is True

    day += dt.timedelta(days=1)
    assert allowance.take(a) is True


def test_limit_spans_characters() -> None:
    model = ScriptedModel(answer())
    allowance = dialogue.TurnAllowance(per_day=2)
    client = TestClient(create_app(Settings(), model=model, allowance=allowance))
    turn(client, "bartender")
    turn(client, "bouncer")

    limited = turn(client, "bouncer", "One.")
    bouncer = load_characters()["bouncer"]
    assert limited == {"line": bouncer.canned, "options": [], "goal_reached": False, "ended": True}
    assert len(model.calls) == 2


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


def test_player_id_must_be_a_uuid() -> None:
    # The same anonymous id the game saves under (progress spec, Autosave).
    client = TestClient(create_app(Settings(), model=ScriptedModel(answer())))
    body = {"character": "bartender"}
    assert client.post("/dialogue/turn", json=body).status_code == 422
    assert (
        client.post("/dialogue/turn", headers={"X-Player-Id": "nope"}, json=body).status_code == 422
    )


@pytest.fixture
def database(tmp_path: Path) -> Settings:
    return Settings(database_url=f"sqlite:///{tmp_path}/punland.db")


def test_characters_remember_across_a_restart(database: Settings) -> None:
    # Characters remember: the conversation is kept with the player's game, so a redeploy
    # (here: a new app on the same database) doesn't make the bouncer forget.
    model = ScriptedModel(answer())
    with TestClient(create_app(database, model=model)) as first:
        turn(first, "bouncer")
        for _ in range(3):
            latest = turn(first, "bouncer", "I play the kazoo.")
        assert len(reaching(latest)) == 1

    model.calls.clear()
    with TestClient(create_app(database, model=model)) as again:
        back = turn(again, "bouncer", "Hello?")
    assert len(reaching(back)) == 1
    assert any("kazoo" in m["content"] for m in model.calls[0])


def test_new_game_forgets_conversations(database: Settings) -> None:
    # A new game clears the save (DELETE /saves); its conversations go with it, so the
    # bouncer's goal can be reached again.
    model = ScriptedModel(answer())
    with TestClient(create_app(database, model=model)) as client:
        latest = turn(client, "bouncer")
        while not reaching(latest):
            latest = turn(client, "bouncer", "I play the kazoo.")
        assert turn(client, "bouncer", reaching(latest)[0])["goal_reached"] is True

        assert client.delete("/saves", headers=PLAYER).status_code == 204
        model.calls.clear()
        fresh = turn(client, "bouncer")
    assert reaching(fresh) == []
    assert GOAL in model.calls[0][0]["content"]
    assert not any("kazoo" in m["content"] for m in model.calls[0])


def test_unusable_database_keeps_the_dialogue_going(tmp_path: Path) -> None:
    # A database that can't be used disables saves, never the dialogue.
    broken = Settings(database_url=f"sqlite:///{tmp_path}/missing-dir/punland.db")
    model = ScriptedModel(answer())
    with TestClient(create_app(broken, model=model)) as client:
        turn(client, "bartender")
        turn(client, "bartender", "I play the kazoo.")
        model.calls.clear()
        turn(client, "bartender")
    assert any("kazoo" in m["content"] for m in model.calls[0])
