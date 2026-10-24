"""Settings from environment variables. Secrets come from Doppler/Railway, never the repo."""

import os
from dataclasses import dataclass, field

# The production site and its Cloudflare Pages preview deployments
# (<hash>.punland.pages.dev and <branch>.punland.pages.dev).
DEFAULT_ORIGINS = ("https://punland.interstellarai.net", "https://punland.pages.dev")
DEFAULT_ORIGIN_REGEX = r"https://[a-z0-9-]+\.punland\.pages\.dev"
DEFAULT_DIALOGUE_MODEL = "anthropic/claude-haiku-4-5"
LOCAL_ORIGINS = ("http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173")


def _split(value: str) -> tuple[str, ...]:
    return tuple(v.strip() for v in value.split(",") if v.strip())


@dataclass(frozen=True)
class Settings:
    environment: str = "development"
    cors_origins: tuple[str, ...] = field(default=DEFAULT_ORIGINS)
    cors_origin_regex: str = DEFAULT_ORIGIN_REGEX
    # Unset means no AI: every character answers with its canned line.
    requesty_api_key: str | None = field(default=None, repr=False)
    requesty_base_url: str = "https://router.requesty.ai/v1"
    dialogue_model: str = DEFAULT_DIALOGUE_MODEL

    @classmethod
    def from_env(cls) -> "Settings":
        env = os.environ.get("PUNLAND_ENV", "development")
        origins = _split(os.environ.get("PUNLAND_CORS_ORIGINS", "")) or DEFAULT_ORIGINS
        if env != "production":
            origins = origins + LOCAL_ORIGINS
        return cls(
            environment=env,
            cors_origins=origins,
            requesty_api_key=os.environ.get("REQUESTY_API_KEY") or None,
            dialogue_model=os.environ.get("PUNLAND_DIALOGUE_MODEL") or DEFAULT_DIALOGUE_MODEL,
        )
