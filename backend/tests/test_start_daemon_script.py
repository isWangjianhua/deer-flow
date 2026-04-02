from __future__ import annotations

from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[2] / "scripts" / "start-daemon.sh"


def test_start_daemon_loads_repo_env_file():
    script = SCRIPT_PATH.read_text(encoding="utf-8")

    assert 'source "$REPO_ROOT/.env"' in script


def test_start_daemon_runs_qdrant_preflight_via_backend_uv_environment():
    script = SCRIPT_PATH.read_text(encoding="utf-8")

    assert '(cd backend && PYTHONPATH=. uv run ../scripts/ensure_qdrant.py)' in script
