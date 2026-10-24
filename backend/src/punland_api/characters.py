"""Characters as content data: one JSON file per character in content/characters/<id>.json."""

import json
from dataclasses import dataclass
from importlib.resources import files


@dataclass(frozen=True)
class Character:
    id: str
    name: str
    sheet: str
    canned: str
    goal: str | None


def _text(data: dict, key: str, source: str) -> str:
    value = data.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{source}: {key!r} must be a non-empty string")
    return value


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
        )
    return characters
