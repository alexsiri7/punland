"""The dialogue model: chat messages in, the raw text of the answer out."""

from collections.abc import Awaitable, Callable

import httpx

from .config import Settings

REQUESTY_BASE_URL = "https://router.requesty.ai/v1"

Model = Callable[[list[dict[str, str]]], Awaitable[str]]


class RequestyModel:
    """Requesty's OpenAI-compatible chat completions. The key never leaves the backend."""

    def __init__(
        self,
        api_key: str,
        model: str,
        base_url: str = REQUESTY_BASE_URL,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._api_key = api_key
        self._model = model
        self._base_url = base_url.rstrip("/")
        self._transport = transport

    async def __call__(self, messages: list[dict[str, str]]) -> str:
        async with httpx.AsyncClient(transport=self._transport, timeout=15) as client:
            res = await client.post(
                f"{self._base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self._api_key}"},
                json={
                    "model": self._model,
                    "messages": messages,
                    "response_format": {"type": "json_object"},
                    "max_tokens": 300,
                },
            )
            res.raise_for_status()
            return res.json()["choices"][0]["message"]["content"]


class NoModel:
    async def __call__(self, messages: list[dict[str, str]]) -> str:
        raise ConnectionError("no model configured")


def model_from_settings(settings: Settings) -> Model:
    if not settings.requesty_api_key:
        return NoModel()
    return RequestyModel(settings.requesty_api_key, settings.dialogue_model)
