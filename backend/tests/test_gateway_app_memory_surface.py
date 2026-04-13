from app.gateway.app import create_app


def test_gateway_app_does_not_mount_memory_routes() -> None:
    app = create_app()
    paths = {route.path for route in app.routes}

    assert not any(path.startswith("/api/memory") for path in paths)
