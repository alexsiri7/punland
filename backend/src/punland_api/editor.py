"""The owner's scene editor: publishing a room's edited layout as a pull request (#123).

The game checks an edit with the content validator before sending it, against the layout the
room had when the page loaded (its base); here the edit is only checked for its shape, and main's
room file must still have that base, so the pull request moves only what the owner moved. The
file's point lines are then rewritten in place, every other byte kept. The pull request changes
that file alone: its before/after screenshots go in a first commit that the second one takes
back out, and its body shows them from that first commit.
EDITOR_GITHUB_TOKEN never leaves the server.
"""

import base64
import binascii
import json
import logging
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from json.decoder import scanstring
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, Field, ValidationError

from .config import Settings
from .owner import csrf, owner_check

REPO = "alexsiri7/punland"
ROOMS = "frontend/src/content/rooms"
SCREENSHOTS = "editor-screenshots"
LABEL = "editor"
# The scene, in scene pixels (frontend/src/domain/geometry.ts, SCENE).
SCENE_WIDTH, SCENE_HEIGHT = 1280, 640
PNG = b"\x89PNG\r\n\x1a\n"
MAX_SCREENSHOT_BYTES = 3 * 1024 * 1024
ROOM_ID = re.compile(r"^[a-z0-9-]+$")

log = logging.getLogger(__name__)


class Point(BaseModel):
    x: int = Field(ge=0, le=SCENE_WIDTH, strict=True)
    y: int = Field(ge=0, le=SCENE_HEIGHT, strict=True)


class HotspotLayout(BaseModel):
    walkTo: Point  # noqa: N815 (the room files' field name)
    at: Point | None = None


class Layout(BaseModel):
    start: Point
    walkable: list[Point] = Field(min_length=3, max_length=32)
    hotspots: dict[str, HotspotLayout] = Field(max_length=200)


class Publish(BaseModel):
    # The room's layout as the game had it when the edit began, and the edited layout.
    base: Layout
    layout: Layout
    # Base64 PNG: MAX_SCREENSHOT_BYTES encoded, with room to spare.
    before: str = Field(max_length=4_200_000)
    after: str = Field(max_length=4_200_000)


class Published(BaseModel):
    url: str
    number: int


class Refused(Exception):
    """An edit that doesn't fit the room's file on main, with what to tell the owner."""


# A span-keeping JSON reader: each value with where it starts and ends in the text, so a
# point can be replaced without touching the rest of the file.

_WS = re.compile(r"[ \t\n\r]*")
_SCALAR = re.compile(r"-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null")


@dataclass
class _Span:
    start: int
    end: int
    value: Any
    # By key for an object, in order for an array.
    children: Any = None

    def get(self, key: str) -> "_Span":
        return self.children[key]


def _skip(text: str, i: int) -> int:
    match = _WS.match(text, i)
    return match.end() if match else i


def _expect(text: str, i: int, char: str) -> None:
    if text[i : i + 1] != char:
        raise ValueError(f"expected {char!r} at {i}")


def _read(text: str, i: int) -> _Span:
    i = _skip(text, i)
    char = text[i : i + 1]
    if char == "{":
        members: dict[str, _Span] = {}
        j = _skip(text, i + 1)
        while text[j : j + 1] != "}":
            _expect(text, j, '"')
            key, j = scanstring(text, j + 1)
            j = _skip(text, j)
            _expect(text, j, ":")
            members[key] = member = _read(text, j + 1)
            j = _skip(text, member.end)
            if text[j : j + 1] == ",":
                j = _skip(text, j + 1)
        value = {k: m.value for k, m in members.items()}
        return _Span(i, j + 1, value, members)
    if char == "[":
        items: list[_Span] = []
        j = _skip(text, i + 1)
        while text[j : j + 1] != "]":
            items.append(item := _read(text, j))
            j = _skip(text, item.end)
            if text[j : j + 1] == ",":
                j = _skip(text, j + 1)
        return _Span(i, j + 1, [item.value for item in items], items)
    if char == '"':
        string, end = scanstring(text, i + 1)
        return _Span(i, end, string)
    match = _SCALAR.match(text, i)
    if not match:
        raise ValueError(f"unexpected {char!r} at {i}")
    return _Span(i, match.end(), json.loads(match.group()))


def _point(p: Point) -> str:
    return f'{{ "x": {p.x}, "y": {p.y} }}'


def layout_of(room: dict[str, Any]) -> dict[str, Any]:
    """A room file's points, as a layout dumps them."""
    return {
        "start": room["start"],
        "walkable": room["walkable"],
        "hotspots": {
            h["id"]: {
                "walkTo": h["walkTo"],
                **({"at": h["target"]["at"]} if "at" in h["target"] else {}),
            }
            for h in room["hotspots"]
        },
    }


def patch_room(text: str, base: Layout, layout: Layout) -> str:
    """The room file with the layout's points in it, written as the room files write them.

    Refused unless the file still has the base layout: a point the owner didn't move is never
    written, so an edit made before main changed can't take that change back out.
    """
    root = _read(text, 0)
    if layout_of(root.value) != base.model_dump(exclude_none=True):
        raise Refused("The room changed since this page loaded: reload the page to edit it again.")
    hotspots = root.get("hotspots")
    ids = [h.value["id"] for h in hotspots.children]
    if set(layout.hotspots) != set(ids):
        raise Refused("The edit must keep the room's hotspots, each with its walk-to point.")

    edits: list[tuple[int, int, str]] = []

    def put(span: _Span, p: Point) -> None:
        if span.value != p.model_dump():
            edits.append((span.start, span.end, _point(p)))

    put(root.get("start"), layout.start)
    walkable = root.get("walkable")
    if walkable.value != [p.model_dump() for p in layout.walkable]:
        line = text.rfind("\n", 0, walkable.start) + 1
        indent = re.match(r" *", text[line:])
        outer = indent.group() if indent else ""
        corners = ",\n".join(f"{outer}  {_point(p)}" for p in layout.walkable)
        edits.append((walkable.start, walkable.end, f"[\n{corners}\n{outer}]"))
    for hotspot in hotspots.children:
        moved = layout.hotspots[hotspot.value["id"]]
        put(hotspot.get("walkTo"), moved.walkTo)
        if moved.at is None:
            continue
        target = hotspot.get("target")
        if "at" not in target.value:
            raise Refused(f'"{hotspot.value["id"]}" has no spot to move.')
        put(target.get("at"), moved.at)

    if not edits:
        raise Refused("Nothing to publish: the room is as it is on main.")
    for start, end, replacement in sorted(edits, reverse=True):
        text = text[:start] + replacement + text[end:]
    return text


def changes(before: dict[str, Any], after: dict[str, Any]) -> list[str]:
    """The moved points, one line each, for the pull request's body."""

    def point(p: dict[str, Any]) -> str:
        return f"({p['x']}, {p['y']})"

    lines = []
    if before["start"] != after["start"]:
        lines.append(f"start: {point(before['start'])} → {point(after['start'])}")
    if before["walkable"] != after["walkable"]:
        old, new = before["walkable"], after["walkable"]
        lines.append(
            f"walkable: {len(old)} → {len(new)} corners, " + " ".join(point(p) for p in new)
        )
    for old, new in zip(before["hotspots"], after["hotspots"], strict=True):
        moved = (
            ("walkTo", old["walkTo"], new["walkTo"]),
            ("target.at", old["target"].get("at"), new["target"].get("at")),
        )
        for field, was, now in moved:
            if was != now:
                lines.append(f"hotspots[id={old['id']}].{field}: {point(was)} → {point(now)}")
    return lines


def refusal(error: ValidationError) -> str:
    """A publish body's first problem, for the owner."""
    first = error.errors()[0]
    where = ".".join(str(part) for part in first["loc"])
    return f"The edit doesn't fit: {where}: {first['msg']}."


def screenshot(data: str) -> str:
    """The base64 PNG as GitHub's blob API takes it; refused if it is anything else."""
    try:
        raw = base64.b64decode(data, validate=True)
    except (binascii.Error, ValueError):
        raw = b""
    if not raw.startswith(PNG) or len(raw) > MAX_SCREENSHOT_BYTES:
        raise Refused("The screenshots must be PNG images.")
    return data


class GitHubError(Exception):
    def __init__(self, status: int) -> None:
        super().__init__(status)
        self.status = status


class GitHub:
    """The calls publishing makes to GitHub's REST API, with the editor's token."""

    def __init__(self, token: str, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._client = httpx.AsyncClient(
            base_url=f"https://api.github.com/repos/{REPO}",
            transport=transport,
            timeout=20,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )

    async def __aenter__(self) -> "GitHub":
        return self

    async def __aexit__(self, *_: object) -> None:
        await self._client.aclose()

    async def call(self, method: str, path: str, body: Any = None) -> Any:
        res = await self._client.request(method, path, json=body)
        if not res.is_success:
            log.warning("GitHub answered %s %s with %s", method, path, res.status_code)
            raise GitHubError(res.status_code)
        return res.json()

    async def blob(self, content: str) -> str:
        made = await self.call("POST", "/git/blobs", {"content": content, "encoding": "base64"})
        return made["sha"]

    async def commit(self, base: str, base_tree: str, files: dict[str, str], message: str) -> str:
        entries = [
            {"path": path, "mode": "100644", "type": "blob", "sha": sha}
            for path, sha in files.items()
        ]
        tree = await self.call("POST", "/git/trees", {"base_tree": base_tree, "tree": entries})
        made = await self.call(
            "POST", "/git/commits", {"message": message, "tree": tree["sha"], "parents": [base]}
        )
        return made["sha"]


async def open_pull_request(github: GitHub, room: str, body: Publish, now: datetime) -> Published:
    path = f"{ROOMS}/{room}.json"
    before, after = screenshot(body.before), screenshot(body.after)
    main = (await github.call("GET", "/git/ref/heads/main"))["object"]["sha"]
    main_tree = (await github.call("GET", f"/git/commits/{main}"))["tree"]["sha"]
    try:
        file = await github.call("GET", f"/contents/{path}?ref={main}")
    except GitHubError as error:
        if error.status == 404:
            raise HTTPException(status_code=404, detail="No such room.") from error
        raise
    text = base64.b64decode(file["content"]).decode()
    patched = patch_room(text, body.base, body.layout)

    stamp = now.strftime("%Y%m%d-%H%M%S")
    shots = {
        f"{SCREENSHOTS}/{stamp}/{room}-{name}.png": data
        for name, data in (("before", before), ("after", after))
    }
    shot_blobs = {p: await github.blob(data) for p, data in shots.items()}
    room_blob = await github.blob(base64.b64encode(patched.encode()).decode())
    with_shots = await github.commit(
        main, main_tree, shot_blobs, f"Editor: screenshots for {room}, taken back out next"
    )
    title = f"Editor: move points in {room}"
    edited = await github.commit(with_shots, main_tree, {path: room_blob}, title)
    branch = f"editor/{room}-{stamp}"
    await github.call("POST", "/git/refs", {"ref": f"refs/heads/{branch}", "sha": edited})

    images = [
        f"![{name}](https://raw.githubusercontent.com/{REPO}/{with_shots}/{p})"
        for p, name in zip(shots, ("Before", "After"), strict=True)
    ]
    moved = "\n".join(f"- `{line}`" for line in changes(json.loads(text), json.loads(patched)))
    description = (
        f"Moved in the in-game editor (#123): only `{path}` changes.\n\n"
        f"## Before\n\n{images[0]}\n\n## After\n\n{images[1]}\n\n"
        f"## Moved\n\n{moved}\n\n"
        "The first commit only carries the screenshots, and the second takes them back out: "
        "squash-merging keeps the room file alone.\n"
    )
    pull = await github.call(
        "POST", "/pulls", {"title": title, "head": branch, "base": "main", "body": description}
    )
    try:
        await github.call("POST", f"/issues/{pull['number']}/labels", {"labels": [LABEL]})
    except GitHubError:
        log.warning("the editor label was not added to #%s", pull["number"])
    return Published(url=pull["html_url"], number=pull["number"])


def router(settings: Settings, transport: httpx.AsyncBaseTransport | None = None) -> APIRouter:
    api = APIRouter(dependencies=[Depends(csrf)])

    @api.post(
        "/editor/rooms/{room}/publish",
        status_code=201,
        dependencies=[Depends(owner_check(settings))],
    )
    async def publish(room: str, raw: Annotated[Any, Body()]) -> Published:
        if not ROOM_ID.match(room):
            raise HTTPException(status_code=404, detail="No such room.")
        # Validated here, not by FastAPI, so that every refusal's detail is one line to show.
        try:
            body = Publish.model_validate(raw)
        except ValidationError as error:
            raise HTTPException(status_code=422, detail=refusal(error)) from error
        if not settings.editor_github_token:
            raise HTTPException(status_code=503, detail="Publishing isn't set up.")
        try:
            async with GitHub(settings.editor_github_token, transport) as github:
                return await open_pull_request(github, room, body, datetime.now(UTC))
        except Refused as refused:
            raise HTTPException(status_code=422, detail=str(refused)) from refused
        except GitHubError as error:
            raise HTTPException(
                status_code=502, detail=f"GitHub refused the change ({error.status})."
            ) from error
        except httpx.HTTPError as error:
            log.warning("GitHub unreachable: %s", type(error).__name__)
            raise HTTPException(status_code=502, detail="Couldn't reach GitHub.") from error

    return api
