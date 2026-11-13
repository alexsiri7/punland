"""Acceptance tests for openspec/specs/editor/spec.md: owner sign-in (#122), publishing (#123)."""

import asyncio
import base64
import copy
import difflib
import json
import time
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from punland_api.app import create_app
from punland_api.config import Settings
from punland_api.editor import Layout, Point, Refused, changes, layout_of, patch_room
from punland_api.owner import COOKIE, SESSION_SECONDS, GoogleTokenInfo, sign_session

CLIENT_ID = "test-client.apps.googleusercontent.com"
OWNER = "owner@example.com"
SECRET = "test-secret-" + "x" * 40
NONCE = "nonce-1"
CSRF = {"X-Punland-CSRF": "1"}

CONFIGURED = Settings(google_client_id=CLIENT_ID, owner_email=OWNER, session_secret=SECRET)


def claims(**overrides: Any) -> dict[str, Any]:
    return {
        "aud": CLIENT_ID,
        "iss": "https://accounts.google.com",
        "email": OWNER,
        "email_verified": "true",
        "exp": str(int(time.time()) + 3600),
        "nonce": NONCE,
        **overrides,
    }


def client(settings: Settings = CONFIGURED, answer: dict[str, Any] | None = None) -> TestClient:
    async def tokeninfo(token: str) -> dict[str, Any] | None:
        return answer

    # https, so the client sends the Secure cookie back.
    return TestClient(create_app(settings, tokeninfo=tokeninfo), base_url="https://testserver")


def sign_in(c: TestClient, nonce: str = NONCE) -> httpx.Response:
    return c.post("/auth/google", headers=CSRF, json={"credential": "id-token", "nonce": nonce})


def owner_cookie(c: TestClient, value: str) -> None:
    c.cookies.set(COOKIE, value)


def me(c: TestClient) -> dict[str, Any]:
    res = c.get("/me", headers=CSRF)
    assert res.status_code == 200
    return res.json()


# Requirement: Owner sign-in
def test_sign_in_not_configured() -> None:
    c = client(Settings(), answer=claims())
    assert me(c) == {"owner": False, "google_client_id": None}
    assert sign_in(c).status_code == 404
    owner_cookie(c, sign_session(OWNER, SECRET, time.time()))
    assert c.get("/editor/ping", headers=CSRF).status_code == 401


def test_sign_in_needs_every_setting() -> None:
    for settings in (
        Settings(google_client_id=CLIENT_ID, owner_email=OWNER),
        Settings(google_client_id=CLIENT_ID, session_secret=SECRET),
        Settings(owner_email=OWNER, session_secret=SECRET),
    ):
        assert me(client(settings)) == {"owner": False, "google_client_id": None}


# Requirement: Owner sign-in
def test_the_owner_signs_in() -> None:
    c = client(answer=claims())
    res = sign_in(c)
    assert res.status_code == 200
    assert res.json() == {"owner": True}
    assert me(c) == {"owner": True, "google_client_id": CLIENT_ID}
    assert c.get("/editor/ping", headers=CSRF).status_code == 204


def test_the_owner_email_is_matched_without_case() -> None:
    c = client(answer=claims(email="Owner@Example.COM"))
    assert sign_in(c).json() == {"owner": True}
    assert me(c)["owner"] is True


# Requirement: Owner sign-in
@pytest.mark.parametrize(
    "answer",
    [
        claims(email="someone@example.com"),
        claims(email_verified="false"),
        claims(aud="another-client"),
        claims(iss="https://evil.example"),
        claims(nonce="another-nonce"),
        claims(exp=str(int(time.time()) - 1)),
        {k: v for k, v in claims().items() if k != "nonce"},
        None,
    ],
)
def test_someone_else_signs_in(answer: dict[str, Any] | None) -> None:
    c = client(answer=answer)
    res = sign_in(c)
    assert res.status_code == 200
    assert res.json() == {"owner": False}
    assert "set-cookie" not in res.headers
    assert me(c)["owner"] is False


# Requirement: Owner session
def test_the_session_cookie() -> None:
    res = sign_in(client(answer=claims()))
    cookie = res.headers["set-cookie"]
    attributes = {a.strip().lower() for a in cookie.split(";")}
    assert cookie.startswith(f"{COOKIE}=")
    assert {"httponly", "secure", "samesite=strict", f"max-age={SESSION_SECONDS}"} <= attributes
    assert SESSION_SECONDS <= 12 * 60 * 60


# Requirement: Owner sign-in
def test_signing_out() -> None:
    c = client(answer=claims())
    sign_in(c)
    res = c.post("/auth/signout", headers=CSRF)
    assert res.status_code == 204
    cleared = res.headers["set-cookie"].lower()
    assert cleared.startswith(f"{COOKIE}=")
    assert "max-age=0" in cleared
    assert me(c)["owner"] is False
    assert c.get("/editor/ping", headers=CSRF).status_code == 401


# Requirement: Owner-only endpoints
def test_no_session() -> None:
    c = client()
    assert c.get("/editor/ping", headers=CSRF).status_code == 401
    assert me(c)["owner"] is False


def _tampered() -> str:
    payload, _, signature = sign_session(OWNER, SECRET, time.time()).partition(".")
    other = sign_session("someone@example.com", SECRET, time.time()).partition(".")[0]
    assert other != payload
    return f"{other}.{signature}"


# Requirement: Owner-only endpoints
@pytest.mark.parametrize(
    "value",
    [
        sign_session(OWNER, "another-secret", time.time()),
        _tampered(),
        "x",
        "a.b.c",
        ".",
    ],
)
def test_forged_session(value: str) -> None:
    c = client()
    owner_cookie(c, value)
    assert c.get("/editor/ping", headers=CSRF).status_code == 401
    assert me(c)["owner"] is False


# Requirement: Owner-only endpoints
def test_expired_session() -> None:
    c = client()
    owner_cookie(c, sign_session(OWNER, SECRET, time.time() - SESSION_SECONDS - 1))
    assert c.get("/editor/ping", headers=CSRF).status_code == 401
    assert me(c)["owner"] is False


def test_a_session_ends_when_the_owner_email_changes() -> None:
    c = client(
        Settings(google_client_id=CLIENT_ID, owner_email="new@example.com", session_secret=SECRET)
    )
    owner_cookie(c, sign_session(OWNER, SECRET, time.time()))
    assert c.get("/editor/ping", headers=CSRF).status_code == 401


# Requirement: Owner-only endpoints
@pytest.mark.parametrize("headers", [{}, {"X-Punland-CSRF": "0"}])
def test_no_csrf_header(headers: dict[str, str]) -> None:
    c = client(answer=claims())
    owner_cookie(c, sign_session(OWNER, SECRET, time.time()))
    assert c.get("/me", headers=headers).status_code == 403
    assert c.get("/editor/ping", headers=headers).status_code == 403
    body = {"credential": "id-token", "nonce": NONCE}
    signed_in = c.post("/auth/google", headers=headers, json=body)
    assert signed_in.status_code == 403
    assert "set-cookie" not in signed_in.headers
    signed_out = c.post("/auth/signout", headers=headers)
    assert signed_out.status_code == 403
    assert "set-cookie" not in signed_out.headers


# Requirement: Owner-only endpoints
def test_who_is_signed_in() -> None:
    c = client()
    assert me(c) == {"owner": False, "google_client_id": CLIENT_ID}
    owner_cookie(c, sign_session(OWNER, SECRET, time.time()))
    assert me(c) == {"owner": True, "google_client_id": CLIENT_ID}


# Requirement: Owner-only endpoints (CORS keeps its origins, never `*`)
def test_cors_allows_the_csrf_header_with_credentials_from_the_site_only() -> None:
    c = client()
    preflight = {
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "x-punland-csrf",
    }
    site = "https://punland.interstellarai.net"
    res = c.options("/me", headers={"Origin": site, **preflight})
    assert res.status_code == 200
    assert res.headers["access-control-allow-origin"] == site
    assert res.headers["access-control-allow-credentials"] == "true"
    evil = c.options("/me", headers={"Origin": "https://evil.example", **preflight})
    assert evil.status_code == 400
    assert "access-control-allow-origin" not in evil.headers
    plain = c.get("/health", headers={"Origin": site})
    assert plain.headers["access-control-allow-origin"] == site


def test_google_tokeninfo() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.params["id_token"] == "good":  # noqa: S105
            return httpx.Response(200, json={"email": OWNER})
        return httpx.Response(400, json={"error": "invalid_token"})

    tokeninfo = GoogleTokenInfo(transport=httpx.MockTransport(handler))
    assert asyncio.run(tokeninfo("good")) == {"email": OWNER}
    assert asyncio.run(tokeninfo("bad")) is None


# Requirement: Publishing a room

ROOMS = Path(__file__).parents[2] / "frontend/src/content/rooms"
ROOM = "coach-station"
TOKEN = "github-token-" + "y" * 20  # noqa: S105
PNG = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"pixels").decode()
PUBLISHING = Settings(
    google_client_id=CLIENT_ID, owner_email=OWNER, session_secret=SECRET, editor_github_token=TOKEN
)


def room_text(room: str = ROOM) -> str:
    return (ROOMS / f"{room}.json").read_text()


def moved_cop() -> dict[str, Any]:
    layout = layout_of(json.loads(room_text()))
    layout["hotspots"]["cop"]["at"] = {"x": 880, "y": 560}
    return layout


class FakeGitHub:
    """GitHub's REST API for one repository whose main has the real room files."""

    def __init__(self, refuse: dict[str, int] | None = None) -> None:
        # Paths, by their end, that GitHub answers with an error status.
        self.refuse = refuse or {}
        self.requests: list[httpx.Request] = []
        self.blobs: dict[str, str] = {}
        self.trees: dict[str, dict[str, Any]] = {}
        self.commits: dict[str, dict[str, Any]] = {}

    def writes(self) -> list[httpx.Request]:
        return [r for r in self.requests if r.method != "GET"]

    def sent(self, path: str) -> list[dict[str, Any]]:
        return [json.loads(r.content) for r in self.requests if r.url.path.endswith(path)]

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        assert request.headers["authorization"] == f"Bearer {TOKEN}"
        path = request.url.path.removeprefix("/repos/alexsiri7/punland")
        for end, status in self.refuse.items():
            if path.endswith(end):
                return httpx.Response(status, json={"message": "refused"})
        body = json.loads(request.content) if request.content else None
        if path == "/git/ref/heads/main":
            return httpx.Response(200, json={"object": {"sha": "main"}})
        if path == "/git/commits/main":
            return httpx.Response(200, json={"tree": {"sha": "main-tree"}})
        if path.startswith("/contents/frontend/src/content/rooms/"):
            assert request.url.params["ref"] == "main"
            file = ROOMS / path.rsplit("/", 1)[1]
            if not file.exists():
                return httpx.Response(404, json={"message": "Not Found"})
            return httpx.Response(
                200, json={"content": base64.b64encode(file.read_bytes()).decode()}
            )
        if path == "/git/blobs":
            sha = f"blob-{len(self.blobs)}"
            self.blobs[sha] = body["content"]
            return httpx.Response(201, json={"sha": sha})
        if path == "/git/trees":
            sha = f"tree-{len(self.trees)}"
            self.trees[sha] = body
            return httpx.Response(201, json={"sha": sha})
        if path == "/git/commits":
            sha = f"commit-{len(self.commits)}"
            self.commits[sha] = body
            return httpx.Response(201, json={"sha": sha})
        if path == "/git/refs":
            return httpx.Response(201, json={"ref": body["ref"]})
        if path == "/pulls":
            return httpx.Response(201, json={"number": 7, "html_url": "https://github.com/pull/7"})
        if path == "/issues/7/labels":
            return httpx.Response(200, json=[{"name": "editor"}])
        return httpx.Response(404)


def publisher(
    settings: Settings = PUBLISHING, refuse: dict[str, int] | None = None
) -> tuple[TestClient, FakeGitHub]:
    github = FakeGitHub(refuse)
    app = create_app(settings, github=httpx.MockTransport(github.handler))
    return TestClient(app, base_url="https://testserver"), github


def publish(c: TestClient, layout: dict[str, Any], **overrides: Any) -> httpx.Response:
    base = layout_of(json.loads(room_text()))
    body = {"base": base, "layout": layout, "before": PNG, "after": PNG, **overrides}
    return c.post(f"/editor/rooms/{ROOM}/publish", headers=CSRF, json=body)


def test_publishing_opens_a_pull_request() -> None:
    c, github = publisher()
    owner_cookie(c, sign_session(OWNER, SECRET, time.time()))
    res = publish(c, moved_cop())
    assert res.status_code == 201
    assert res.json() == {"url": "https://github.com/pull/7", "number": 7}

    shots, edited = github.sent("/git/trees")
    assert {e["path"].rsplit("-", 1)[1] for e in shots["tree"]} == {"before.png", "after.png"}
    assert all(e["path"].startswith("editor-screenshots/") for e in shots["tree"])
    assert [e["path"] for e in edited["tree"]] == [f"frontend/src/content/rooms/{ROOM}.json"]
    assert shots["base_tree"] == edited["base_tree"] == "main-tree"
    first, second = github.sent("/git/commits")
    assert first["parents"] == ["main"]
    assert second["parents"] == ["commit-0"]

    patched = base64.b64decode(github.blobs[edited["tree"][0]["sha"]]).decode()
    diff = [
        line
        for line in difflib.unified_diff(room_text().splitlines(), patched.splitlines(), n=0)
        if line[:1] in "+-" and not line.startswith(("+++", "---"))
    ]
    assert diff == [
        '-      "target": { "entity": "cop", "at": { "x": 1040, "y": 552 } },',
        '+      "target": { "entity": "cop", "at": { "x": 880, "y": 560 } },',
    ]

    (ref,) = github.sent("/git/refs")
    assert ref["sha"] == "commit-1"
    assert ref["ref"].startswith(f"refs/heads/editor/{ROOM}-")
    (pull,) = github.sent("/pulls")
    assert pull["head"] == ref["ref"].removeprefix("refs/heads/")
    assert pull["base"] == "main"
    for e in shots["tree"]:
        assert (
            f"https://raw.githubusercontent.com/alexsiri7/punland/commit-0/{e['path']}"
            in pull["body"]
        )
    assert "hotspots[id=cop].target.at: (1040, 552) → (880, 560)" in pull["body"]
    assert github.sent("/issues/7/labels") == [{"labels": ["editor"]}]


def test_a_pull_request_stands_without_its_label() -> None:
    c, github = publisher(refuse={"/labels": 403})
    owner_cookie(c, sign_session(OWNER, SECRET, time.time()))
    res = publish(c, moved_cop())
    assert res.status_code == 201
    assert len(github.sent("/pulls")) == 1


def _layout(**changes: Any) -> dict[str, Any]:
    layout = copy.deepcopy(moved_cop())
    layout.update(changes)
    return layout


@pytest.mark.parametrize(
    ("layout", "overrides"),
    [
        (_layout(hotspots={**moved_cop()["hotspots"], "ghost": {"walkTo": {"x": 1, "y": 1}}}), {}),
        (_layout(hotspots={k: v for k, v in moved_cop()["hotspots"].items() if k != "cop"}), {}),
        (_layout(start={"x": 1281, "y": 10}), {}),
        (_layout(start={"x": 10.5, "y": 10}), {}),
        (_layout(walkable=moved_cop()["walkable"][:2]), {}),
        (_layout(walkable=[{"x": 600 + i, "y": 600} for i in range(33)]), {}),
        (layout_of(json.loads(room_text())), {}),
        (
            _layout(
                hotspots={
                    **moved_cop()["hotspots"],
                    "board": {"walkTo": {"x": 660, "y": 565}, "at": {"x": 1, "y": 1}},
                }
            ),
            {},
        ),
        (moved_cop(), {"before": base64.b64encode(b"GIF89a").decode()}),
        (moved_cop(), {"after": "not base64!"}),
    ],
)
def test_an_invalid_edit_is_refused(layout: dict[str, Any], overrides: dict[str, Any]) -> None:
    c, github = publisher()
    owner_cookie(c, sign_session(OWNER, SECRET, time.time()))
    res = publish(c, layout, **overrides)
    assert res.status_code == 422
    assert isinstance(res.json()["detail"], str)
    assert github.writes() == []


def test_an_edit_too_big_to_take_says_why() -> None:
    c, github = publisher()
    owner_cookie(c, sign_session(OWNER, SECRET, time.time()))
    res = publish(c, _layout(walkable=[{"x": 600 + i, "y": 600} for i in range(33)]))
    assert res.status_code == 422
    assert res.json()["detail"].startswith("The edit doesn't fit: layout.walkable: ")
    assert "32" in res.json()["detail"]


def test_an_edit_made_before_main_changed_is_refused() -> None:
    # The room on main moved the cop since the page loaded; the owner only moved the start.
    c, github = publisher()
    owner_cookie(c, sign_session(OWNER, SECRET, time.time()))
    base = layout_of(json.loads(room_text()))
    base["hotspots"]["cop"]["at"] = {"x": 700, "y": 560}
    layout = copy.deepcopy(base)
    layout["start"] = {"x": layout["start"]["x"] + 1, "y": layout["start"]["y"]}
    res = publish(c, layout, base=base)
    assert res.status_code == 422
    assert res.json() == {
        "detail": "The room changed since this page loaded: reload the page to edit it again."
    }
    assert github.writes() == []


def test_publishing_an_unknown_room() -> None:
    c, github = publisher()
    owner_cookie(c, sign_session(OWNER, SECRET, time.time()))
    body = {
        "base": layout_of(json.loads(room_text())),
        "layout": moved_cop(),
        "before": PNG,
        "after": PNG,
    }
    assert c.post("/editor/rooms/nowhere/publish", headers=CSRF, json=body).status_code == 404
    assert c.post("/editor/rooms/..%2Fsecrets/publish", headers=CSRF, json=body).status_code == 404
    assert github.writes() == []


@pytest.mark.parametrize(
    ("cookie", "headers", "status"),
    [
        (None, CSRF, 401),
        ("forged", CSRF, 401),
        ("owner", {}, 403),
    ],
)
def test_publishing_without_a_session(
    cookie: str | None, headers: dict[str, str], status: int
) -> None:
    c, github = publisher()
    if cookie == "owner":
        owner_cookie(c, sign_session(OWNER, SECRET, time.time()))
    elif cookie == "forged":
        owner_cookie(c, _tampered())
    body = {
        "base": layout_of(json.loads(room_text())),
        "layout": moved_cop(),
        "before": PNG,
        "after": PNG,
    }
    assert c.post(f"/editor/rooms/{ROOM}/publish", headers=headers, json=body).status_code == status
    assert github.requests == []


def test_publishing_not_set_up() -> None:
    c, github = publisher(CONFIGURED)
    owner_cookie(c, sign_session(OWNER, SECRET, time.time()))
    res = publish(c, moved_cop())
    assert res.status_code == 503
    assert github.requests == []
    assert TOKEN not in repr(PUBLISHING)


def test_github_refusing_the_change() -> None:
    c, github = publisher(refuse={"/git/refs": 422})
    owner_cookie(c, sign_session(OWNER, SECRET, time.time()))
    res = publish(c, moved_cop())
    assert res.status_code == 502
    assert res.json() == {"detail": "GitHub refused the change (422)."}
    assert github.sent("/pulls") == []


@pytest.mark.parametrize("path", sorted(ROOMS.glob("*.json")), ids=lambda p: p.stem)
def test_patching_a_room_keeps_every_other_byte(path: Path) -> None:
    text = path.read_text()
    room = json.loads(text)
    layout = layout_of(room)
    base = Layout.model_validate(layout)
    with pytest.raises(Refused, match="Nothing to publish"):
        patch_room(text, base, base)

    layout["start"] = {"x": layout["start"]["x"] + 1, "y": layout["start"]["y"]}
    corners = layout["walkable"]
    layout["walkable"] = [*corners[:1], {"x": 640, "y": 600}, *corners[1:]]
    patched = patch_room(text, base, Layout.model_validate(layout))
    expected = copy.deepcopy(room)
    expected["start"] = layout["start"]
    expected["walkable"] = layout["walkable"]
    assert json.loads(patched) == expected
    changed = [
        line
        for line in difflib.unified_diff(text.splitlines(), patched.splitlines(), n=0)
        if line[:1] in "+-" and not line.startswith(("+++", "---"))
    ]
    start = next(line for line in text.splitlines() if line.lstrip().startswith('"start"'))
    walkable = next(line for line in text.splitlines() if line.lstrip().startswith('"walkable"'))
    indent = walkable[: len(walkable) - len(walkable.lstrip())]
    assert changed == [
        f"-{start}",
        "+" + start.replace(f'"x": {room["start"]["x"]},', f'"x": {layout["start"]["x"]},'),
        f'+{indent}  {{ "x": 640, "y": 600 }},',
    ]


def test_keys_the_game_ignores_do_not_block_a_publish() -> None:
    # The frontend reads a scene-node target without an `at` and a point as just x and y, so
    # neither is in the base it sends.
    text = room_text("high-street")
    stray = (
        text.replace(
            '"target": { "node": "back" }', '"target": { "node": "back", "at": { "x": 1, "y": 2 } }'
        )
        .replace(
            '"walkTo": { "x": 140, "y": 570 }', '"walkTo": { "x": 140, "y": 570, "note": "door" }'
        )
        .replace('{ "x": 80, "y": 540 }', '{ "x": 80, "y": 540, "note": "kerb" }')
    )
    assert '"at": { "x": 1, "y": 2 }' in stray and stray.count('"note"') == 2
    base = Layout.model_validate(layout_of(json.loads(text)))

    moved = base.model_copy(deep=True)
    moved.start = Point(x=base.start.x + 1, y=base.start.y)
    patched = patch_room(stray, base, moved)
    # Only the moved point is written: the keys on the others stay.
    changed = [
        line
        for line in difflib.unified_diff(stray.splitlines(), patched.splitlines(), lineterm="")
        if line[:1] in "+-" and not line.startswith(("+++", "---"))
    ]
    assert len(changed) == 2 and all('"start"' in line for line in changed)
    assert changes(json.loads(stray), json.loads(patched)) == [
        f"start: ({base.start.x}, {base.start.y}) → ({moved.start.x}, {moved.start.y})"
    ]

    moved.hotspots["back"].at = moved.start
    with pytest.raises(Refused, match='"back" has no spot to move'):
        patch_room(stray, base, moved)
