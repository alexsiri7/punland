"""Settings from environment variables. Secrets come from Doppler/Railway, never the repo."""

import os
from dataclasses import dataclass, field

# The production site and its Cloudflare Pages preview deployments
# (<hash>.punland.pages.dev and <branch>.punland.pages.dev).
DEFAULT_ORIGINS = ("https://punland.interstellarai.net", "https://punland.pages.dev")
DEFAULT_ORIGIN_REGEX = r"https://[a-z0-9-]+\.punland\.pages\.dev"
LOCAL_ORIGINS = ("http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173")


def _split(value: str) -> tuple[str, ...]:
    return tuple(v.strip() for v in value.split(",") if v.strip())


@dataclass(frozen=True)
class Settings:
    environment: str = "development"
    cors_origins: tuple[str, ...] = field(default=DEFAULT_ORIGINS)
    cors_origin_regex: str = DEFAULT_ORIGIN_REGEX

    @classmethod
    def from_env(cls) -> "Settings":
        env = os.environ.get("PUNLAND_ENV", "development")
        origins = _split(os.environ.get("PUNLAND_CORS_ORIGINS", "")) or DEFAULT_ORIGINS
        if env != "production":
            origins = origins + LOCAL_ORIGINS
        return cls(environment=env, cors_origins=origins)
