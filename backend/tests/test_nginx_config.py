from __future__ import annotations

from pathlib import Path


def _read(path: str) -> str:
    repo_root = Path(__file__).resolve().parents[2]
    return (repo_root / path).read_text(encoding="utf-8")


def test_local_nginx_config_proxies_new_gateway_bff_routes():
    config = _read("docker/nginx/nginx.local.conf")

    assert "location /api/auth" in config
    assert "location /api/conversations" in config
    assert "location /api/chat" in config


def test_docker_nginx_config_proxies_new_gateway_bff_routes():
    config = _read("docker/nginx/nginx.conf")

    assert "location /api/auth" in config
    assert "location /api/conversations" in config
    assert "location /api/chat" in config
