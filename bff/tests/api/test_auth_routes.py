def test_me_requires_auth(client) -> None:
    response = client.get("/me")

    assert response.status_code == 401


def test_login_returns_bearer_token(client) -> None:
    response = client.post(
        "/auth/login",
        json={"username": "demo", "password": "demo123"},
    )

    assert response.status_code == 200
    assert response.json()["token_type"] == "bearer"
    assert response.json()["access_token"]


def test_me_returns_current_user(client) -> None:
    login = client.post("/auth/login", json={"username": "demo", "password": "demo123"})
    token = login.json()["access_token"]

    response = client.get("/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json()["username"] == "demo"
