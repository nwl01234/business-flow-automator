import os
import pathlib
import tempfile

# Конфиг должен быть выставлен до импорта приложения: engine создаётся на импорте.
_TMP = pathlib.Path(tempfile.mkdtemp(prefix="bfa-tests-"))
os.environ["DATABASE_URL"] = "sqlite:///" + (_TMP / "test.db").as_posix()
os.environ["JWT_SECRET"] = "test-secret"
os.environ["SEED_DEMO"] = "true"
os.environ["TELEGRAM_BOT_TOKEN"] = ""
os.environ["NOTIFY_CHAT_ID"] = ""

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from backend.app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def admin_token(client):
    resp = client.post("/api/auth/login", json={"login": "admin", "password": "admin123"})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


@pytest.fixture(scope="session")
def manager_token(client):
    resp = client.post("/api/auth/login", json={"login": "manager", "password": "manager123"})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


@pytest.fixture(scope="session")
def bot_token(client):
    resp = client.post("/api/auth/login", json={"login": "telegram_bot", "password": "bot_secret_change_me"})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def product(client, admin_token):
    counter = product.__dict__.get("_n", 0) + 1
    product.__dict__["_n"] = counter
    resp = client.post("/api/inventory", headers=auth(admin_token), json={
        "sku": f"TEST-{counter:04d}", "name": f"Тестовый товар {counter}",
        "stock": 10, "price": 1500,
    })
    assert resp.status_code == 200, resp.text
    return resp.json()
