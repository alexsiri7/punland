"""Owner sign-in: Google sign-in for the owner alone, a signed session cookie, and CSRF.

The browser gets a Google ID token from Google's redirect sign-in and posts it here; Google's
tokeninfo endpoint checks it, and only OWNER_EMAIL gets a session. Every route that reads or
sets the session needs the X-Punland-CSRF header, which a cross-origin page cannot send past
CORS. Editor routes depend on `owner_check`.
"""

import base64
import binascii
import hashlib
import hmac
import json
import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from .config import Settings

COOKIE = "punland_owner"
CSRF_HEADER = "X-Punland-CSRF"
SESSION_SECONDS = 12 * 60 * 60
TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
GOOGLE_ISSUERS = frozenset({"accounts.google.com", "https://accounts.google.com"})

log = logging.getLogger(__name__)

# An ID token in, its claims out once Google has checked its signature and expiry; None when
# Google refuses it or can't be reached.
TokenInfo = Callable[[str], Awaitable[dict[str, Any] | None]]


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _signature(payload: str, secret: str) -> str:
    return _b64(hmac.new(secret.encode(), payload.encode(), hashlib.sha256).digest())


def sign_session(email: str, secret: str, now: float) -> str:
    payload = _b64(json.dumps({"email": email, "exp": int(now) + SESSION_SECONDS}).encode())
    return f"{payload}.{_signature(payload, secret)}"


def session_email(value: str, secret: str, owner_email: str, now: float) -> str | None:
    """The owner's email from a session cookie, or None if it is forged, expired or not the
    current owner's."""
    payload, _, signature = value.partition(".")
    if not hmac.compare_digest(signature.encode(), _signature(payload, secret).encode()):
        return None
    try:
        data = json.loads(_unb64(payload))
        email, exp = data["email"], data["exp"]
    except (ValueError, binascii.Error, KeyError, TypeError):
        return None
    if not isinstance(email, str) or not isinstance(exp, int) or exp <= now:
        return None
    return email if email.casefold() == owner_email.casefold() else None


def owner_claims(claims: dict[str, Any], settings: Settings, nonce: str, now: float) -> str | None:
    """The owner's email if these tokeninfo claims are a fresh sign-in by the owner for this
    game, else None."""
    email = claims.get("email")
    try:
        exp = int(claims.get("exp", 0))
    except (TypeError, ValueError):
        return None
    if (
        claims.get("aud") != settings.google_client_id
        or claims.get("iss") not in GOOGLE_ISSUERS
        or claims.get("email_verified") not in ("true", True)
        or not isinstance(email, str)
        or email.casefold() != (settings.owner_email or "").casefold()
        or exp <= now
        or not nonce
        or claims.get("nonce") != nonce
    ):
        return None
    return email


class GoogleTokenInfo:
    """Google's tokeninfo endpoint: it checks the token's signature and expiry for us."""

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._transport = transport

    async def __call__(self, id_token: str) -> dict[str, Any] | None:
        try:
            async with httpx.AsyncClient(transport=self._transport, timeout=10) as client:
                res = await client.get(TOKENINFO_URL, params={"id_token": id_token})
        except httpx.HTTPError as exc:
            log.warning("tokeninfo failed: %s", type(exc).__name__)
            return None
        if res.status_code != 200:
            return None
        claims = res.json()
        return claims if isinstance(claims, dict) else None


class SignIn(BaseModel):
    credential: str = Field(max_length=4096)
    nonce: str = Field(max_length=100)


class Me(BaseModel):
    owner: bool
    # Public by nature; null when sign-in is not configured, so the game offers none.
    google_client_id: str | None


class SignedIn(BaseModel):
    owner: bool


def csrf(request: Request) -> None:
    if request.headers.get(CSRF_HEADER) != "1":
        raise HTTPException(status_code=403, detail="Forbidden")


def is_owner(request: Request, settings: Settings) -> bool:
    value = request.cookies.get(COOKIE)
    if not settings.owner_sign_in or not value:
        return False
    secret, owner_email = settings.session_secret or "", settings.owner_email or ""
    return session_email(value, secret, owner_email, time.time()) is not None


def owner_check(settings: Settings) -> Callable[[Request], None]:
    """The dependency of every editor route: anyone but the owner gets a 401."""

    def require_owner(request: Request) -> None:
        if not is_owner(request, settings):
            raise HTTPException(status_code=401, detail="Not signed in")

    return require_owner


def router(settings: Settings, tokeninfo: TokenInfo) -> APIRouter:
    api = APIRouter(dependencies=[Depends(csrf)])
    configured = settings.owner_sign_in
    secret = settings.session_secret or ""

    @api.get("/me")
    def me(request: Request) -> Me:
        return Me(
            owner=is_owner(request, settings),
            google_client_id=settings.google_client_id if configured else None,
        )

    # A refusal is a 200 with owner false and no cookie, the same for every reason: a 4xx
    # would show up in the browser's console, a hint that there is something to sign in to.
    @api.post("/auth/google")
    async def sign_in(body: SignIn, response: Response) -> SignedIn:
        if not configured:
            raise HTTPException(status_code=404, detail="Not Found")
        claims = await tokeninfo(body.credential)
        now = time.time()
        email = owner_claims(claims, settings, body.nonce, now) if claims else None
        if email is None:
            log.info("owner sign-in refused")
            return SignedIn(owner=False)
        response.set_cookie(
            COOKIE,
            sign_session(email, secret, now),
            max_age=SESSION_SECONDS,
            path="/",
            secure=True,
            httponly=True,
            samesite="strict",
        )
        return SignedIn(owner=True)

    @api.post("/auth/signout", status_code=204)
    def sign_out(response: Response) -> None:
        response.delete_cookie(COOKIE, path="/", secure=True, httponly=True, samesite="strict")

    # The sample owner-only route; the editor's routes (editor.py) depend on owner_check too.
    @api.get("/editor/ping", status_code=204, dependencies=[Depends(owner_check(settings))])
    def ping() -> None:
        return None

    return api
