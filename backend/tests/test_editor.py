"""Acceptance tests for openspec/specs/editor/spec.md (#122): owner sign-in."""

import asyncio
import time
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from punland_api.app import create_app
from punland_api.config import Settings
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
