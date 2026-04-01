from __future__ import annotations

import importlib.util
from pathlib import Path


SCRIPT_PATH = (
    Path(__file__).resolve().parents[2] / "scripts" / "ensure_qdrant.py"
)


def load_module():
    spec = importlib.util.spec_from_file_location("ensure_qdrant", SCRIPT_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def write_config(tmp_path: Path, content: str) -> Path:
    path = tmp_path / "config.yaml"
    path.write_text(content)
    return path


def test_main_noops_when_mem0_qdrant_not_enabled(tmp_path, monkeypatch, capsys):
    module = load_module()
    config_path = write_config(
        tmp_path,
        """
memory:
  provider: file
""".strip(),
    )

    monkeypatch.setattr(module, "find_config_path", lambda: config_path)

    assert module.main() == 0
    assert capsys.readouterr().out == ""


def test_main_returns_success_when_qdrant_is_already_healthy(tmp_path, monkeypatch, capsys):
    module = load_module()
    config_path = write_config(
        tmp_path,
        """
memory:
  provider: mem0
  mem0:
    vector_store:
      provider: qdrant
      config:
        host: 127.0.0.1
        port: 6333
""".strip(),
    )

    monkeypatch.setattr(module, "find_config_path", lambda: config_path)
    monkeypatch.setattr(module, "check_qdrant_health", lambda host, port: True)

    assert module.main() == 0
    assert "Qdrant is already healthy" in capsys.readouterr().out


def test_main_starts_existing_container_when_local_qdrant_is_down(tmp_path, monkeypatch, capsys):
    module = load_module()
    config_path = write_config(
        tmp_path,
        """
memory:
  provider: mem0
  mem0:
    vector_store:
      provider: qdrant
      config:
        host: localhost
        port: 6333
""".strip(),
    )

    checks = iter([False, True])
    started = []

    monkeypatch.setattr(module, "find_config_path", lambda: config_path)
    monkeypatch.setattr(module, "check_qdrant_health", lambda host, port: next(checks))
    monkeypatch.setattr(module, "detect_container_runtime", lambda: "docker")
    monkeypatch.setattr(module, "container_exists", lambda runtime, name: True)
    monkeypatch.setattr(
        module,
        "start_container",
        lambda runtime, name: started.append((runtime, name)),
    )
    monkeypatch.setattr(module.time, "sleep", lambda _: None)

    assert module.main() == 0
    assert started == [("docker", "deerflow-qdrant")]
    assert "starting existing Qdrant container" in capsys.readouterr().out


def test_main_fails_with_help_when_container_is_missing(tmp_path, monkeypatch, capsys):
    module = load_module()
    config_path = write_config(
        tmp_path,
        """
memory:
  provider: mem0
  mem0:
    vector_store:
      provider: qdrant
      config:
        host: localhost
        port: 6333
""".strip(),
    )

    monkeypatch.setattr(module, "find_config_path", lambda: config_path)
    monkeypatch.setattr(module, "check_qdrant_health", lambda host, port: False)
    monkeypatch.setattr(module, "detect_container_runtime", lambda: "podman")
    monkeypatch.setattr(module, "container_exists", lambda runtime, name: False)

    assert module.main() == 1
    out = capsys.readouterr().out
    assert "Qdrant is required" in out
    assert "podman run -d" in out


def test_health_check_treats_connection_reset_as_unhealthy(monkeypatch):
    module = load_module()

    def raise_reset(*args, **kwargs):
        raise ConnectionResetError(104, "reset")

    monkeypatch.setattr(module.urllib.request, "urlopen", raise_reset)

    assert module.check_qdrant_health("127.0.0.1", 6333) is False
