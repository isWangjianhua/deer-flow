def test_me_requires_auth(client) -> None:
    response = client.get("/me")

    assert response.status_code == 401


def test_login_returns_bearer_token(client) -> None:
    response = client.post(
        "/auth/login",
        json={"username": "demo", "password": "demo1234"},
    )

    assert response.status_code == 200
    assert response.json()["token_type"] == "bearer"
    assert response.json()["access_token"]


def test_register_returns_bearer_token(client) -> None:
    response = client.post(
        "/auth/register",
        json={"username": "new-user", "password": "secret123"},
    )

    assert response.status_code == 200
    assert response.json()["token_type"] == "bearer"
    assert response.json()["access_token"]


def test_register_rejects_duplicate_username(client) -> None:
    response = client.post(
        "/auth/register",
        json={"username": "demo", "password": "secret123"},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == {
        "code": "username_exists",
        "message": "Username already exists",
    }


def test_register_rejects_invalid_payload(client) -> None:
    response = client.post(
        "/auth/register",
        json={"username": "ab", "password": "short"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == {
        "code": "invalid_username",
        "message": "Username must be between 3 and 64 characters",
    }


def test_register_is_unavailable_when_local_auth_is_disabled(client, monkeypatch) -> None:
    from app.core.config import Settings
    from app.services import auth_service as auth_service_module

    settings = Settings(
        bff_auth_provider="oidc",
        bff_oidc_issuer="https://issuer.example.com",
        bff_oidc_audience="deerflow-bff",
        bff_oidc_jwks_url="https://issuer.example.com/.well-known/jwks.json",
        database_url="sqlite:///./test.db",
        bff_secret_key="test-secret",
        deerflow_gateway_base_url="http://127.0.0.1:8001",
    )
    monkeypatch.setattr(auth_service_module, "get_settings", lambda: settings)

    response = client.post(
        "/auth/register",
        json={"username": "new-user", "password": "secret123"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == {
        "code": "local_registration_disabled",
        "message": "Local registration is unavailable",
    }


def test_me_returns_current_user_in_local_mode(client) -> None:
    login = client.post("/auth/login", json={"username": "demo", "password": "demo1234"})
    token = login.json()["access_token"]

    response = client.get("/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json()["username"] == "demo"
