import importlib.util
from pathlib import Path
import zipfile

spec = importlib.util.spec_from_file_location("release_check", Path("scripts/release_check.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def test_secret_values_are_detected_but_never_printed():
    token = "123456789:" + "A" * 35
    errors = module.inspect_bytes("settings.py", token.encode())
    assert errors and "Telegram token" in errors[0]
    assert token not in "\n".join(errors)


def test_runtime_data_and_credentials_are_not_publishable():
    for name in [".test-data/live/bot.sqlite3", ".env", "bots/token.pem", ".local-tools/debug.py"]:
        assert module.inspect_bytes(name, b"data")
    assert not module.inspect_bytes("examples/.env.example", b"BOT_TOKEN=")
    assert not module.inspect_bytes("src/package/main.py", b'print("example")')


def test_source_archive_is_scanned_without_extracting(tmp_path):
    path = tmp_path / "source.zip"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("project/.test-data/live.sqlite3", b"private")
    assert module.inspect_archive(path)


def test_machine_specific_home_path_is_not_published():
    content = b"C:/" + b"Users/private-person/project/main.py"
    assert "workspace path" in module.inspect_bytes("notes.md", content)[0]
