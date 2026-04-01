#!/usr/bin/env python3
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import yaml


DEFAULT_CONTAINER_NAME = "deerflow-qdrant"
LOCAL_HOSTS = {"127.0.0.1", "localhost", "0.0.0.0"}


def find_config_path() -> Path | None:
    candidates: list[Path] = []
    env_path = os.environ.get("DEER_FLOW_CONFIG_PATH")
    if env_path:
        candidates.append(Path(env_path))
    repo_root = Path(__file__).resolve().parents[1]
    candidates.append(repo_root / "backend" / "config.yaml")
    candidates.append(repo_root / "config.yaml")

    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return None


def load_qdrant_target(config_path: Path) -> tuple[str, int] | None:
    config = yaml.safe_load(config_path.read_text()) or {}
    memory = config.get("memory") or {}
    if memory.get("provider") != "mem0":
        return None

    mem0 = memory.get("mem0") or {}
    vector_store = mem0.get("vector_store") or {}
    if vector_store.get("provider") != "qdrant":
        return None

    vector_config = vector_store.get("config") or {}
    host = str(vector_config.get("host") or "127.0.0.1")
    port = int(vector_config.get("port") or 6333)
    return host, port


def check_qdrant_health(host: str, port: int) -> bool:
    try:
        with urllib.request.urlopen(f"http://{host}:{port}/healthz", timeout=2) as response:
            return response.status == 200
    except (urllib.error.URLError, TimeoutError, ValueError, OSError):
        return False


def detect_container_runtime() -> str | None:
    for candidate in ("docker", "podman"):
        if shutil.which(candidate):
            return candidate
    return None


def container_exists(runtime: str, name: str) -> bool:
    result = subprocess.run(
        [runtime, "ps", "-a", "--format", "{{.Names}}"],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return False
    return name in {line.strip() for line in result.stdout.splitlines() if line.strip()}


def start_container(runtime: str, name: str) -> None:
    subprocess.run([runtime, "start", name], check=True)


def print_manual_start_help(runtime: str, host: str, port: int, container_name: str) -> None:
    print("✗ Qdrant is required for mem0, but it is not reachable.")
    print(f"  Expected: http://{host}:{port}/healthz")
    print("")
    print("  Start a local Qdrant container with:")
    print(f"    {runtime} run -d \\")
    print(f"      --name {container_name} \\")
    print(f"      -p {port}:6333 \\")
    print('      -v "$(pwd)/.tmp/qdrant_storage:/qdrant/storage" \\')
    print("      qdrant/qdrant")


def main() -> int:
    config_path = find_config_path()
    if config_path is None:
        return 0

    target = load_qdrant_target(config_path)
    if target is None:
        return 0

    host, port = target
    if check_qdrant_health(host, port):
        print(f"✓ Qdrant is already healthy at {host}:{port}")
        return 0

    if host not in LOCAL_HOSTS:
        print(f"✗ Remote Qdrant at {host}:{port} is not reachable.")
        return 1

    runtime = detect_container_runtime()
    if runtime is None:
        print(f"✗ Qdrant is not reachable at {host}:{port}, and no docker/podman runtime was found.")
        return 1

    container_name = os.environ.get("DEER_FLOW_QDRANT_CONTAINER", DEFAULT_CONTAINER_NAME)
    if not container_exists(runtime, container_name):
        print_manual_start_help(runtime, host, port, container_name)
        return 1

    print(f"⚠ Qdrant is down; starting existing Qdrant container '{container_name}' via {runtime}...")
    try:
        start_container(runtime, container_name)
    except subprocess.CalledProcessError as exc:
        print(f"✗ Failed to start Qdrant container '{container_name}': {exc}")
        return 1

    for _ in range(20):
        if check_qdrant_health(host, port):
            print(f"✓ Qdrant is healthy at {host}:{port}")
            return 0
        time.sleep(1)

    print(f"✗ Qdrant container '{container_name}' started but health check still failed at {host}:{port}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
