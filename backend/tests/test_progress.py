"""Acceptance tests for openspec/specs/progress/spec.md, the backend's side (#10).

The game keeps one save per anonymous player behind /saves, with the player's id in
X-Player-Id. The tests run the real app and its migrations against a SQLite file.
"""

import uuid
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from punland_api.app import create_app
from punland_api.config import Settings
from punland_api.saves import MAX_SAVE_BYTES

PLAYER = {"X-Player-Id": str(uuid.uuid4())}
SAVE = {"version": 1, "room": "pub-interior", "savedAt": "2026-10-25T12:00:00.000Z"}


@pytest.fixture
def database(tmp_path: Path) -> Settings:
    return Settings(database_url=f"sqlite:///{tmp_path}/saves.db")


@pytest.fixture
def client(database: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(database)) as client:
        yield client


def test_closing_and_coming_back(database: Settings) -> None:
    # Requirement: Autosave. Progress is saved automatically, without signing up, and is
    # there on the next visit (here: a restarted server on the same database).
    with TestClient(create_app(database)) as first:
        assert first.put("/saves", headers=PLAYER, json=SAVE).status_code == 204
    with TestClient(create_app(database)) as again:
        res = again.get("/saves", headers=PLAYER)
    assert res.status_code == 200
    assert res.json() == SAVE


def test_no_save_is_204(client: TestClient) -> None:
    res = client.get("/saves", headers=PLAYER)
    assert res.status_code == 204
    assert res.content == b""


def test_saves_are_per_player(client: TestClient) -> None:
    client.put("/saves", headers=PLAYER, json=SAVE)
    other = {"X-Player-Id": str(uuid.uuid4())}
    assert client.get("/saves", headers=other).status_code == 204


def test_put_overwrites(client: TestClient) -> None:
    client.put("/saves", headers=PLAYER, json=SAVE)
    later = {**SAVE, "room": "opening", "inventory": {"items": ["flyer"], "pickedUp": ["flyer"]}}
    assert client.put("/saves", headers=PLAYER, json=later).status_code == 204
    assert client.get("/saves", headers=PLAYER).json() == later


def test_delete_clears(client: TestClient) -> None:
    client.put("/saves", headers=PLAYER, json=SAVE)
    assert client.delete("/saves", headers=PLAYER).status_code == 204
    assert client.get("/saves", headers=PLAYER).status_code == 204


def test_player_id_must_be_a_uuid(client: TestClient) -> None:
    assert client.get("/saves").status_code == 422
    assert client.get("/saves", headers={"X-Player-Id": "nope"}).status_code == 422
    assert client.put("/saves", headers={"X-Player-Id": "nope"}, json=SAVE).status_code == 422


def test_save_must_be_a_json_object(client: TestClient) -> None:
    assert client.put("/saves", headers=PLAYER, json=[SAVE]).status_code == 422
    assert client.put("/saves", headers=PLAYER, content=b"{not json").status_code == 422
    assert client.get("/saves", headers=PLAYER).status_code == 204


def test_oversized_save_is_413(client: TestClient) -> None:
    big = {**SAVE, "padding": "x" * MAX_SAVE_BYTES}
    assert client.put("/saves", headers=PLAYER, json=big).status_code == 413
    assert client.get("/saves", headers=PLAYER).status_code == 204


def test_without_database_saves_are_unavailable() -> None:
    with TestClient(create_app(Settings())) as client:
        assert client.get("/saves", headers=PLAYER).status_code == 503
        assert client.put("/saves", headers=PLAYER, json=SAVE).status_code == 503
        assert client.get("/health").status_code == 200


def test_unreachable_database_degrades(tmp_path: Path) -> None:
    unreachable = Settings(database_url=f"sqlite:///{tmp_path}/missing-dir/saves.db")
    with TestClient(create_app(unreachable)) as client:
        assert client.put("/saves", headers=PLAYER, json=SAVE).status_code == 503
        assert client.get("/health").status_code == 200
