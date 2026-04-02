import asyncio
import stat
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from app.gateway.routers import uploads


class StubUploadFile:
    def __init__(self, filename: str, content: bytes):
        self.filename = filename
        self._content = content

    async def read(self) -> bytes:
        return self._content


def test_upload_files_writes_thread_storage_and_skips_local_sandbox_sync(tmp_path):
    thread_uploads_dir = tmp_path / "uploads"
    thread_uploads_dir.mkdir(parents=True)

    provider = MagicMock()
    provider.acquire.return_value = "local"
    sandbox = MagicMock()
    provider.get.return_value = sandbox

    with (
        patch.object(uploads, "get_uploads_dir", return_value=thread_uploads_dir),
        patch.object(uploads, "ensure_uploads_dir", return_value=thread_uploads_dir),
        patch.object(uploads, "get_sandbox_provider", return_value=provider),
        patch.object(uploads, "require_owned_thread", return_value=None),
    ):
        file = StubUploadFile(filename="notes.txt", content=b"hello uploads")
        result = asyncio.run(uploads.upload_files("thread-local", files=[file], user=SimpleNamespace(id="user_a")))

    assert result.success is True
    assert len(result.files) == 1
    assert result.files[0]["filename"] == "notes.txt"
    assert (thread_uploads_dir / "notes.txt").read_bytes() == b"hello uploads"

    sandbox.update_file.assert_not_called()


def test_upload_files_syncs_non_local_sandbox_and_marks_markdown_file(tmp_path):
    thread_uploads_dir = tmp_path / "uploads"
    thread_uploads_dir.mkdir(parents=True)

    provider = MagicMock()
    provider.acquire.return_value = "aio-1"
    sandbox = MagicMock()
    provider.get.return_value = sandbox

    async def fake_convert(file_path: Path) -> Path:
        md_path = file_path.with_suffix(".md")
        md_path.write_text("converted", encoding="utf-8")
        return md_path

    with (
        patch.object(uploads, "get_uploads_dir", return_value=thread_uploads_dir),
        patch.object(uploads, "ensure_uploads_dir", return_value=thread_uploads_dir),
        patch.object(uploads, "get_sandbox_provider", return_value=provider),
        patch.object(uploads, "convert_file_to_markdown", AsyncMock(side_effect=fake_convert)),
        patch.object(uploads, "require_owned_thread", return_value=None),
    ):
        file = StubUploadFile(filename="report.pdf", content=b"pdf-bytes")
        result = asyncio.run(uploads.upload_files("thread-aio", files=[file], user=SimpleNamespace(id="user_a")))

    assert result.success is True
    assert len(result.files) == 1
    file_info = result.files[0]
    assert file_info["filename"] == "report.pdf"
    assert file_info["markdown_file"] == "report.md"

    assert (thread_uploads_dir / "report.pdf").read_bytes() == b"pdf-bytes"
    assert (thread_uploads_dir / "report.md").read_text(encoding="utf-8") == "converted"

    sandbox.update_file.assert_any_call("/mnt/user-data/uploads/report.pdf", b"pdf-bytes")
    sandbox.update_file.assert_any_call("/mnt/user-data/uploads/report.md", b"converted")


def test_upload_files_makes_non_local_files_sandbox_writable(tmp_path):
    thread_uploads_dir = tmp_path / "uploads"
    thread_uploads_dir.mkdir(parents=True)

    provider = MagicMock()
    provider.acquire.return_value = "aio-1"
    sandbox = MagicMock()
    provider.get.return_value = sandbox

    async def fake_convert(file_path: Path) -> Path:
        md_path = file_path.with_suffix(".md")
        md_path.write_text("converted", encoding="utf-8")
        return md_path

    with (
        patch.object(uploads, "get_uploads_dir", return_value=thread_uploads_dir),
        patch.object(uploads, "ensure_uploads_dir", return_value=thread_uploads_dir),
        patch.object(uploads, "get_sandbox_provider", return_value=provider),
        patch.object(uploads, "convert_file_to_markdown", AsyncMock(side_effect=fake_convert)),
        patch.object(uploads, "_make_file_sandbox_writable") as make_writable,
        patch.object(uploads, "require_owned_thread", return_value=None),
    ):
        file = StubUploadFile(filename="report.pdf", content=b"pdf-bytes")
        result = asyncio.run(uploads.upload_files("thread-aio", files=[file], user=SimpleNamespace(id="user_a")))

    assert result.success is True
    make_writable.assert_any_call(thread_uploads_dir / "report.pdf")
    make_writable.assert_any_call(thread_uploads_dir / "report.md")


def test_upload_files_does_not_adjust_permissions_for_local_sandbox(tmp_path):
    thread_uploads_dir = tmp_path / "uploads"
    thread_uploads_dir.mkdir(parents=True)

    provider = MagicMock()
    provider.acquire.return_value = "local"
    sandbox = MagicMock()
    provider.get.return_value = sandbox

    with (
        patch.object(uploads, "get_uploads_dir", return_value=thread_uploads_dir),
        patch.object(uploads, "ensure_uploads_dir", return_value=thread_uploads_dir),
        patch.object(uploads, "get_sandbox_provider", return_value=provider),
        patch.object(uploads, "_make_file_sandbox_writable") as make_writable,
        patch.object(uploads, "require_owned_thread", return_value=None),
    ):
        file = StubUploadFile(filename="notes.txt", content=b"hello uploads")
        result = asyncio.run(uploads.upload_files("thread-local", files=[file], user=SimpleNamespace(id="user_a")))

    assert result.success is True
    make_writable.assert_not_called()


def test_make_file_sandbox_writable_adds_write_bits_for_regular_files(tmp_path):
    file_path = tmp_path / "report.pdf"
    file_path.write_bytes(b"pdf-bytes")
    os_chmod_mode = stat.S_IRUSR | stat.S_IRGRP | stat.S_IROTH
    file_path.chmod(os_chmod_mode)

    uploads._make_file_sandbox_writable(file_path)

    updated_mode = stat.S_IMODE(file_path.stat().st_mode)
    assert updated_mode & stat.S_IWUSR
    assert updated_mode & stat.S_IWGRP
    assert updated_mode & stat.S_IWOTH


def test_make_file_sandbox_writable_skips_symlinks(tmp_path):
    file_path = tmp_path / "target-link.txt"
    file_path.write_text("hello", encoding="utf-8")
    symlink_stat = MagicMock(st_mode=stat.S_IFLNK)

    with (
        patch.object(uploads.os, "lstat", return_value=symlink_stat),
        patch.object(uploads.os, "chmod") as chmod,
    ):
        uploads._make_file_sandbox_writable(file_path)

    chmod.assert_not_called()


def test_upload_files_rejects_dotdot_and_dot_filenames(tmp_path):
    thread_uploads_dir = tmp_path / "uploads"
    thread_uploads_dir.mkdir(parents=True)

    provider = MagicMock()
    provider.acquire.return_value = "local"
    sandbox = MagicMock()
    provider.get.return_value = sandbox

    with (
        patch.object(uploads, "get_uploads_dir", return_value=thread_uploads_dir),
        patch.object(uploads, "ensure_uploads_dir", return_value=thread_uploads_dir),
        patch.object(uploads, "get_sandbox_provider", return_value=provider),
        patch.object(uploads, "require_owned_thread", return_value=None),
    ):
        # These filenames must be rejected outright
        for bad_name in ["..", "."]:
            file = StubUploadFile(filename=bad_name, content=b"data")
            result = asyncio.run(uploads.upload_files("thread-local", files=[file], user=SimpleNamespace(id="user_a")))
            assert result.success is True
            assert result.files == [], f"Expected no files for unsafe filename {bad_name!r}"

        # Path-traversal prefixes are stripped to the basename and accepted safely
        file = StubUploadFile(filename="../etc/passwd", content=b"data")
        result = asyncio.run(uploads.upload_files("thread-local", files=[file], user=SimpleNamespace(id="user_a")))
        assert result.success is True
        assert len(result.files) == 1
        assert result.files[0]["filename"] == "passwd"

    # Only the safely normalised file should exist
    assert [f.name for f in thread_uploads_dir.iterdir()] == ["passwd"]


def test_delete_uploaded_file_removes_generated_markdown_companion(tmp_path):
    thread_uploads_dir = tmp_path / "uploads"
    thread_uploads_dir.mkdir(parents=True)
    (thread_uploads_dir / "report.pdf").write_bytes(b"pdf-bytes")
    (thread_uploads_dir / "report.md").write_text("converted", encoding="utf-8")

    with (
        patch.object(uploads, "get_uploads_dir", return_value=thread_uploads_dir),
        patch.object(uploads, "require_owned_thread", return_value=None),
    ):
        result = asyncio.run(uploads.delete_uploaded_file("thread-aio", "report.pdf", user=SimpleNamespace(id="user_a")))

    assert result == {"success": True, "message": "Deleted report.pdf"}
    assert not (thread_uploads_dir / "report.pdf").exists()
    assert not (thread_uploads_dir / "report.md").exists()
