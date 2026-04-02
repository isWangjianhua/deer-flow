from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.gateway.routers import skills
from app.gateway.thread_ownership import create_owned_thread


@pytest.mark.anyio
async def test_install_skill_rejects_foreign_thread_owner(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))
    create_owned_thread(user_id="user_a", biz_thread_id="thread_a")

    called = False

    def fake_install_skill_from_archive(_path):
        nonlocal called
        called = True
        return {"success": True, "skill_name": "demo", "message": "ok"}

    monkeypatch.setattr(skills, "install_skill_from_archive", fake_install_skill_from_archive)

    with pytest.raises(HTTPException) as exc_info:
        await skills.install_skill(
            skills.SkillInstallRequest(thread_id="thread_a", path="mnt/user-data/outputs/demo.skill"),
            user=SimpleNamespace(id="user_b"),
        )

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "Thread thread_a not found"
    assert called is False


@pytest.mark.anyio
async def test_install_skill_uses_owned_thread_path(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))
    create_owned_thread(user_id="user_a", biz_thread_id="thread_a")

    expected_path = tmp_path / "demo.skill"
    captured: dict[str, object] = {}

    monkeypatch.setattr(skills, "resolve_thread_virtual_path", lambda thread_id, path: expected_path)

    def fake_install_skill_from_archive(path):
        captured["path"] = path
        return {"success": True, "skill_name": "demo", "message": "ok"}

    monkeypatch.setattr(skills, "install_skill_from_archive", fake_install_skill_from_archive)

    response = await skills.install_skill(
        skills.SkillInstallRequest(thread_id="thread_a", path="mnt/user-data/outputs/demo.skill"),
        user=SimpleNamespace(id="user_a"),
    )

    assert captured["path"] == expected_path
    assert response.success is True
    assert response.skill_name == "demo"
