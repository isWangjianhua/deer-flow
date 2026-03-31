from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.gateway.auth.passwords import hash_password
from app.gateway.auth.session import (
    SESSION_COOKIE_NAME,
    create_user,
)
from app.gateway.routers.auth import router


def _make_app() -> FastAPI:
    app = FastAPI()
    app.include_router(router)
    return app


def test_login_sets_session_cookie(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))
    create_user(username="alice", password_hash=hash_password("secret123"))

    with TestClient(_make_app()) as client:
        response = client.post("/api/auth/login", json={"username": "alice", "password": "secret123"})

    assert response.status_code == 200
    assert response.json()["username"] == "alice"
    cookie_header = response.headers.get("set-cookie", "")
    assert SESSION_COOKIE_NAME in cookie_header
    assert "HttpOnly" in cookie_header


def test_me_returns_current_user(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))

    with TestClient(_make_app()) as client:
        register = client.post("/api/auth/register", json={"username": "alice", "password": "secret123"})
        assert register.status_code == 201

        response = client.get("/api/auth/me")

    assert response.status_code == 200
    assert response.json()["username"] == "alice"


def test_logout_clears_cookie(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))

    with TestClient(_make_app()) as client:
        register = client.post("/api/auth/register", json={"username": "alice", "password": "secret123"})
        assert register.status_code == 201

        response = client.post("/api/auth/logout")

    assert response.status_code == 204
    cookie_header = response.headers.get("set-cookie", "")
    assert SESSION_COOKIE_NAME in cookie_header
    assert "Max-Age=0" in cookie_header or "expires=" in cookie_header.lower()
