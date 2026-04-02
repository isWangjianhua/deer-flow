from __future__ import annotations

from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[2] / "scripts" / "serve.sh"


def test_serve_script_excludes_virtualenv_and_build_artifacts_from_gateway_reload():
    script = SCRIPT_PATH.read_text(encoding="utf-8")

    assert "--reload-exclude='.venv/'" in script
    assert "--reload-exclude='logs/'" in script
    assert "--reload-exclude='.next/'" in script
    assert "--reload-exclude='node_modules/'" in script
    assert "--reload-exclude='.tmp/'" in script
