from __future__ import annotations

import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


def test_make_dev_defaults_to_assistant_ui():
    output = subprocess.check_output(
        ["make", "-n", "dev"],
        cwd=REPO_ROOT,
        text=True,
        encoding="utf-8",
    )

    assert "./scripts/serve.sh --dev --assistant-ui" in output


def test_make_start_keeps_production_mode_without_assistant_ui_override():
    output = subprocess.check_output(
        ["make", "-n", "start"],
        cwd=REPO_ROOT,
        text=True,
        encoding="utf-8",
    )

    assert "./scripts/serve.sh --prod" in output
