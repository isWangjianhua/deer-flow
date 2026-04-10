from tests.http_client import ASGITestClient


def test_health_returns_ok(client: ASGITestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
