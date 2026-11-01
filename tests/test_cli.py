import sys

from telegram_bot_control import cli


def test_installed_windows_application_is_found_without_build_tools(tmp_path, monkeypatch):
    monkeypatch.setattr(cli.shutil, "which", lambda _: None)
    exe = tmp_path / "Programs/Telegram Bot Control/Telegram Bot Control.exe"
    exe.parent.mkdir(parents=True)
    exe.write_bytes(b"fixture")
    assert cli.installed_desktop(tmp_path, "win32", {"LOCALAPPDATA": str(tmp_path)}) == str(exe)
    assert cli.installed_desktop(tmp_path, "linux", {"LOCALAPPDATA": str(tmp_path)}) is None
    # An explicit path wins; invalid explicit paths do not silently launch another app.
    custom = tmp_path / "custom.exe"
    custom.write_bytes(b"fixture")
    assert cli.installed_desktop(tmp_path, "win32", {"BOTCONTROL_DESKTOP": str(custom)}) == str(
        custom
    )
    assert (
        cli.installed_desktop(tmp_path, "win32", {"BOTCONTROL_DESKTOP": str(tmp_path / "missing")})
        is None
    )


def test_open_uses_installed_application_with_same_python_and_data(tmp_path, monkeypatch):
    called = []
    monkeypatch.setattr(cli, "installed_desktop", lambda *_: str(tmp_path / "App with spaces.exe"))
    monkeypatch.setattr(
        cli.subprocess, "Popen", lambda *args, **kwargs: called.append((args, kwargs))
    )
    assert cli.launch_desktop(tmp_path / "data", force_local=True) == 0
    args, kwargs = called[0]
    assert args[0] == [str(tmp_path / "App with spaces.exe")]
    assert kwargs["env"]["BOTCONTROL_PYTHON"] == sys.executable
    assert kwargs["env"]["BOTCONTROL_HOME"] == str(tmp_path / "data")
    assert kwargs["env"]["BOTCONTROL_FORCE_LOCAL"] == "1"


def test_missing_desktop_explains_download_and_web_without_pnpm(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(cli, "__file__", str(tmp_path / "src/package/cli.py"))
    monkeypatch.setattr(cli, "installed_desktop", lambda *_: None)
    assert cli.launch_desktop(tmp_path) == 1
    message = capsys.readouterr().err
    assert (
        "releases/tag/" in message and "python -m telegram_bot_control web --port 8765" in message
    )
    assert "pnpm" not in message and ".venv" not in message


def test_invalid_override_returns_install_help_instead_of_traceback(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(cli, "installed_desktop", lambda *_: str(tmp_path / "missing.exe"))

    def fail(*args, **kwargs):
        raise FileNotFoundError("missing")

    monkeypatch.setattr(cli.subprocess, "Popen", fail)
    assert cli.launch_desktop(tmp_path) == 1
    assert "Traceback" not in capsys.readouterr().err


def test_bare_command_opens_browser_using_own_runtime_and_default_directory(tmp_path, monkeypatch):
    from telegram_bot_control import web

    called = []
    monkeypatch.setenv("BOTCONTROL_HOME", str(tmp_path))
    monkeypatch.setattr(web, "run", lambda *args, **kwargs: called.append((args, kwargs)) or 0)
    assert cli.main([]) == 0
    assert called == [((tmp_path, "127.0.0.1", 8765), {"open_browser": True})]
    called.clear()
    assert cli.main(["open", "--data-dir", str(tmp_path), "--port", "9000", "--no-browser"]) == 0
    assert called == [((tmp_path, "127.0.0.1", 9000), {"open_browser": False})]


def test_help_does_not_start_a_server(monkeypatch):
    import pytest
    from telegram_bot_control import web

    monkeypatch.setattr(web, "run", lambda *_args, **_kwargs: pytest.fail("Help started a server"))
    with pytest.raises(SystemExit) as stopped:
        cli.main(["--help"])
    assert stopped.value.code == 0
