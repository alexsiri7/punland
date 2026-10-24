import pytest
from fastapi.testclient import TestClient

from punland_api.app import create_app
from punland_api.config import Settings


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app(Settings.from_env()))
