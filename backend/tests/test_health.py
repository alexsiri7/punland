from fastapi.testclient import TestClient

from punland_api.app import create_app
from punland_api.config import Settings


def test_health_ok(client: TestClient) -> None:
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_cors_allows_production_site(client: TestClient) -> None:
    res = client.get("/health", headers={"Origin": "https://punland.interstellarai.net"})
    assert res.headers["access-control-allow-origin"] == "https://punland.interstellarai.net"


def test_cors_allows_pages_previews(client: TestClient) -> None:
    origin = "https://feat-scaffold.punland.pages.dev"
    res = client.get("/health", headers={"Origin": origin})
    assert res.headers["access-control-allow-origin"] == origin


def test_cors_rejects_other_origins(client: TestClient) -> None:
    res = client.get("/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in res.headers


def test_production_hides_docs() -> None:
    prod = TestClient(create_app(Settings(environment="production")))
    assert prod.get("/docs").status_code == 404
    assert prod.get("/openapi.json").status_code == 404
