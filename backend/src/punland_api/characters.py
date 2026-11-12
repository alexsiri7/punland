"""Characters as content data: one JSON file per character in content/characters/<id>.json.

A character's optional `must_say` lists lines it must work into a conversation; one with
`unless_carrying`, an item id from frontend/src/content/items.json, only while the cat
doesn't carry that item.
"""

import json
from dataclasses import dataclass
from importlib.resources import files


@dataclass(frozen=True)
class MustSay:
    line: str
    unless_carrying: str | None = None


@dataclass(frozen=True)
class Character:
    id: str
    name: str
    sheet: str
    canned: str
    goal: str | None
    must_say: tuple[MustSay, ...] = ()


def _text(data: dict, key: str, source: str) -> str:
    value = data.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{source}: {key!r} must be a non-empty string")
    return value


def _must_say(data: dict, source: str) -> tuple[MustSay, ...]:
    entries = data.get("must_say", [])
    if not isinstance(entries, list) or not all(isinstance(e, dict) for e in entries):
        raise ValueError(f"{source}: 'must_say' must be a list of objects")
    return tuple(
        MustSay(
            line=_text(entry, "line", source),
            unless_carrying=(
                _text(entry, "unless_carrying", source) if "unless_carrying" in entry else None
            ),
        )
        for entry in entries
    )


def load_characters() -> dict[str, Character]:
    characters = {}
    for entry in (files("punland_api") / "content" / "characters").iterdir():
        if not entry.name.endswith(".json"):
            continue
        data = json.loads(entry.read_text(encoding="utf-8"))
        character_id = entry.name.removesuffix(".json")
        characters[character_id] = Character(
            id=character_id,
            name=_text(data, "name", entry.name),
            sheet=_text(data, "sheet", entry.name),
            canned=_text(data, "canned", entry.name),
            goal=_text(data, "goal", entry.name) if "goal" in data else None,
            must_say=_must_say(data, entry.name),
        )
    return characters
