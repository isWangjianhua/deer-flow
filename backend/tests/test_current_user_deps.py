from __future__ import annotations

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from starlette.requests import Request

from app.gateway.auth.passwords import hash_password
from app.gateway.auth.session import (
    SESSION_HEADER_NAME,
    SESSION_COOKIE_NAME,
    create_user,
    create_user_session,
)


def _make_app():
    from app.gateway.deps import get_current_user_optional

    app = FastAPI()

    @app.get("/me")
    def me(user=Depends(get_current_user_optional)):
        if user is None:
            return {"user": None}
        return {"user": {"id": user.id, "username": user.username}}

    return app


def test_current_user_from_valid_session_cookie(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))

    user = create_user(username="alice", password_hash=hash_password("secret"))
    session = create_user_session(user_id=user.id)

    app = _make_app()
    with TestClient(app) as client:
        response = client.get("/me", cookies={SESSION_COOKIE_NAME: session.session_token})

    assert response.status_code == 200
    assert response.json() == {"user": {"id": user.id, "username": "alice"}}


def test_missing_session_cookie_returns_none(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))

    app = _make_app()
    with TestClient(app) as client:
        response = client.get("/me")

    assert response.status_code == 200
    assert response.json() == {"user": None}


def test_invalid_session_cookie_returns_none(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))

    app = _make_app()
    with TestClient(app) as client:
        response = client.get("/me", cookies={SESSION_COOKIE_NAME: "bad-token"})

    assert response.status_code == 200
    assert response.json() == {"user": None}


def test_current_user_from_valid_session_header(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))

    user = create_user(username="alice", password_hash=hash_password("secret"))
    session = create_user_session(user_id=user.id)

    app = _make_app()
    with TestClient(app) as client:
        response = client.get("/me", headers={SESSION_HEADER_NAME: session.session_token})

    assert response.status_code == 200
    assert response.json() == {"user": {"id": user.id, "username": "alice"}}
