import json
import os
import shutil
import sqlite3
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import psutil
import pytest

from telegram_bot_control.processes import (
    ControlError,
    ProcessManager,
    process_alive,
    validate_profile,
    verified_process,
    runtime_identity,
)
from telegram_bot_control.store import Store, read_snapshot


def wait_for(predicate, timeout=15):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        result = predicate()
        if result:
            return result
        time.sleep(0.1)
    raise AssertionError("Timed out waiting for process state")


@pytest.fixture
def complex_bot(tmp_path):
    project = tmp_path / "Complex bot with spaces"
    shutil.copytree("examples/complex_bot", project)
    directory = tmp_path / "data"
    report = project / "launch report.jsonl"
    config = project / "config with spaces.json"
    config.write_text(
        json.dumps(
            {"prepared": str(project / "prepared.flag"), "required_flavor": "integration & test"}
        )
    )
    env_file = project / ".env"
    env_file.write_text(
        'BOT_FLAVOR="integration & test"\nFIXTURE_SECRET=never-store-this-secret\n',
        encoding="utf-8",
    )
    bot_id = "920000001"
    store = Store(directory, bot_id)
    # A previously registered, stopped bot: no process is implicitly adopted.
    store.write(
        {
            "bot_id": bot_id,
            "name": "Complex test",
            "username": "complex_fixture",
            "entrypoint": str(project / "main.py"),
            "directory": str(project),
            "interpreter": sys.executable,
        },
        {
            "id": "seed",
            "pid": 0,
            "started_at": time.time() - 60,
            "last_seen": time.time() - 60,
            "stopped_at": time.time() - 60,
            "state": "stopped",
            "dropped": 0,
            "write_failures": 0,
        },
        [],
    )
    manager = ProcessManager(directory)
    profile = {
        "command": [
            sys.executable,
            str(project / "main.py"),
            "--bot-id",
            bot_id,
            "--config",
            str(config),
            "--label",
            "Argument with spaces & ; $(not-a-shell)",
            "--report",
            str(report),
        ],
        "cwd": str(project),
        "pre_start": [[sys.executable, str(project / "prepare.py"), "--config", str(config)]],
        "env_file": str(env_file),
        "environment": {},
        "required_env": ["BOT_FLAVOR", "FIXTURE_SECRET"],
    }
    manager.save_profile(bot_id, profile)
    yield manager, bot_id, profile, project, report
    try:
        manager.control(bot_id, "stop", force=True)
    except (ControlError, psutil.Error):
        pass


@pytest.mark.parametrize("module", [False, True])
def test_complex_start_stop_restart_preserves_arguments_cwd_environment_and_prepare(
    complex_bot, module
):
    manager, bot_id, profile, project, report = complex_bot
    if module:
        profile["command"][1:2] = ["-m", "complex_aiogram_bot"]
        manager.save_profile(bot_id, profile)
    assert manager.control(bot_id, "start")["status"] == "starting"
    wait_for(lambda: manager.active_sessions(bot_id))
    first = json.loads(report.read_text(encoding="utf-8").splitlines()[0])
    assert first["label"] == "Argument with spaces & ; $(not-a-shell)"
    assert first["cwd"] == str(project)
    assert first["flavor"] == "integration & test"
    assert first["secret_present"]
    assert (project / "prepared.flag").exists()
    wait_for(lambda: read_snapshot(manager.directory, {})["totals"]["events"] >= 4)
    assert read_snapshot(manager.directory, {})["totals"]["callbacks"] > 0
    assert read_snapshot(manager.directory, {})["totals"]["errors"] > 0
    (project / "prepared.flag").unlink()
    assert manager.control(bot_id, "restart")["status"] == "starting"
    wait_for(
        lambda: (
            len(report.read_text(encoding="utf-8").splitlines()) == 2
            and manager.active_sessions(bot_id)
        )
    )
    second = json.loads(report.read_text(encoding="utf-8").splitlines()[1])
    assert second["pid"] != first["pid"]
    assert second["argv"] == first["argv"]
    assert (project / "prepared.flag").exists()  # preparation was repeated
    assert manager.control(bot_id, "stop")["status"] == "stopped"
    assert not psutil.pid_exists(second["pid"])
    assert not manager.active_sessions(bot_id)
    for path in manager.directory.glob("*.sqlite3*"):
        assert b"never-store-this-secret" not in path.read_bytes()
        assert b"PRIVATE COMPLEX FORM VALUE" not in path.read_bytes()


def test_duplicate_concurrent_start_is_rejected(complex_bot):
    manager, bot_id, *_ = complex_bot

    def launch():
        try:
            return manager.control(bot_id, "start")["status"]
        except ControlError as error:
            return str(error)

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: launch(), range(2)))
    assert results.count("starting") == 1
    assert any(
        value in ("operation_in_progress", "already_starting", "already_running")
        for value in results
    )
    wait_for(lambda: manager.active_sessions(bot_id))


def test_failed_prepare_never_runs_the_bot(complex_bot):
    manager, bot_id, profile, project, report = complex_bot
    profile["pre_start"] = [[sys.executable, "-c", "raise SystemExit(7)"]]
    manager.save_profile(bot_id, profile)
    manager.control(bot_id, "start")
    run = wait_for(
        lambda: run if (run := manager.latest_run(bot_id))["status"] == "failed" else None
    )
    assert run["exit_code"] == 7
    assert run["error"] == "prepare_failed:1"
    assert not report.exists()


def test_force_stop_requires_explicit_request_and_terminates_owned_tree(complex_bot):
    manager, bot_id, profile, _, report = complex_bot
    profile["command"] += ["--ignore-stop", "--spawn-worker"]
    manager.save_profile(bot_id, profile)
    manager.control(bot_id, "start")
    wait_for(lambda: manager.active_sessions(bot_id))
    row = json.loads(report.read_text(encoding="utf-8").splitlines()[0])
    original_bot = psutil.Process(row["pid"])
    original_worker = psutil.Process(row["worker_pid"])
    assert manager.control(bot_id, "stop")["status"] == "needs_force"
    assert psutil.pid_exists(row["pid"])
    assert manager.control(bot_id, "stop", force=True)["status"] == "stopped"
    assert not process_alive(original_bot)
    assert not process_alive(original_worker)


def test_profile_and_process_identity_guards(complex_bot):
    manager, bot_id, profile, *_ = complex_bot
    with pytest.raises(ControlError, match="secret_in_command"):
        validate_profile(
            profile | {"command": [sys.executable, "main.py", "--token", "plain-secret"]}
        )
    with pytest.raises(ControlError, match="secret_in_profile"):
        validate_profile(profile | {"environment": {"BOT_TOKEN": "plain-secret"}})
    current = psutil.Process()
    assert verified_process(current.pid, current.create_time() + 100) is None
    with pytest.raises(ValueError):
        manager.control("../wrong", "stop")


def test_missing_environment_fails_before_launch(complex_bot):
    manager, bot_id, profile, *_ = complex_bot
    manager.save_profile(bot_id, profile | {"required_env": ["ABSENT_BOTCONTROL_TEST_VARIABLE"]})
    with pytest.raises(ControlError, match="missing_environment"):
        manager.control(bot_id, "start")
    assert manager.latest_run(bot_id) is None


def test_bot_survives_stdio_bridge_exit(complex_bot):
    manager, bot_id, *_ = complex_bot
    request = (
        json.dumps(
            {"id": 1, "method": "control_bot", "params": {"bot_id": bot_id, "action": "start"}}
        )
        + "\n"
    )
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "telegram_bot_control.bridge",
            "--stdio",
            "--data-dir",
            str(manager.directory),
        ],
        input=request,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=15,
    )
    assert result.returncode == 0
    assert json.loads(result.stdout)["result"]["status"] == "starting"
    assert wait_for(lambda: manager.active_sessions(bot_id))


def test_powershell_launcher_preserves_complex_arguments(complex_bot):
    manager, bot_id, profile, project, report = complex_bot
    powershell = (
        os.environ.get("BOTCONTROL_TEST_POWERSHELL")
        or shutil.which("pwsh")
        or shutil.which("powershell")
    )
    if not powershell:
        pytest.skip("PowerShell is not installed on this platform")
    original = profile["command"]
    profile["command"] = [
        powershell,
        "-NoProfile",
        "-NonInteractive",
        "-File",
        str(project / "launch-workflow.ps1"),
        "-Python",
        sys.executable,
        "-Config",
        original[original.index("--config") + 1],
        "-Report",
        str(report),
        "-BotId",
        bot_id,
        "-Label",
        "Wrapper & $(literal); value with spaces",
    ]
    manager.save_profile(bot_id, profile)
    manager.control(bot_id, "start")
    wait_for(lambda: manager.active_sessions(bot_id))
    first = json.loads(report.read_text(encoding="utf-8").splitlines()[0])
    assert first["label"] == "Wrapper & $(literal); value with spaces"
    assert manager.control(bot_id, "restart")["status"] == "starting"
    wait_for(
        lambda: (
            len(report.read_text(encoding="utf-8").splitlines()) == 2
            and manager.active_sessions(bot_id)
        )
    )
    second = json.loads(report.read_text(encoding="utf-8").splitlines()[1])
    assert second["label"] == first["label"]
    assert first["pid"] != second["pid"]
    assert manager.control(bot_id, "stop")["status"] == "stopped"


def test_restart_preflight_keeps_working_bot_when_environment_missing(complex_bot):
    manager, bot_id, profile, *_ = complex_bot
    manager.control(bot_id, "start")
    sessions = wait_for(lambda: manager.active_sessions(bot_id))
    manager.save_profile(bot_id, profile | {"required_env": ["ABSENT_BOTCONTROL_TEST_VARIABLE"]})
    with pytest.raises(ControlError, match="missing_environment"):
        manager.control(bot_id, "restart")
    assert psutil.pid_exists(sessions[0]["pid"])


def test_cancelling_prepare_does_not_start_bot(complex_bot):
    manager, bot_id, profile, _, report = complex_bot
    profile["pre_start"] = [[sys.executable, "-c", "import time; time.sleep(15)"]]
    manager.save_profile(bot_id, profile)
    manager.control(bot_id, "start")
    wait_for(lambda: manager.latest_run(bot_id)["status"] == "preparing")
    assert manager.control(bot_id, "stop")["status"] == "stopped"
    assert not report.exists()


def test_reused_pid_identity_is_never_terminated(complex_bot):
    manager, bot_id, *_ = complex_bot
    harmless = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"])
    try:
        born = psutil.Process(harmless.pid).create_time()
        with sqlite3.connect(manager.directory / f"bot-{bot_id}.sqlite3") as connection:
            connection.execute(
                "UPDATE sessions SET pid=?, state='running' WHERE id='seed'", (harmless.pid,)
            )
            connection.execute(
                "INSERT INTO process_identity VALUES (?,?,?,?,?)",
                ("seed", born - 100, psutil.Process(harmless.pid).exe(), "null", ""),
            )
        assert manager.control(bot_id, "stop", force=True)["status"] == "stopped"
        assert harmless.poll() is None
    finally:
        harmless.kill()
        harmless.wait(timeout=3)


def test_process_exiting_between_alive_and_status_is_a_normal_stop():
    class Exiting:
        def is_running(self):
            return True

        def status(self):
            raise psutil.NoSuchProcess(123)

    assert process_alive(Exiting()) is False


def test_detected_launch_does_not_require_the_token_source_environment(monkeypatch):
    token = "123456789:" + "A" * 35
    monkeypatch.setenv("BOT_TOKEN", token)
    profile = runtime_identity(token)["launch_hint"]
    assert profile is not None
    assert profile["required_env"] == []
    assert profile["env_file"] == ""


def test_restricted_process_apis_preserve_telemetry_identity_without_unsafe_control(
    tmp_path, monkeypatch
):
    class RestrictedProcess:
        def create_time(self):
            raise psutil.AccessDenied(os.getpid())

    monkeypatch.setattr(psutil, "Process", RestrictedProcess)
    identity = runtime_identity("not-a-real-token")
    assert identity["created"] == 0 and identity["launch_hint"] is None
    manager = ProcessManager(tmp_path)
    monkeypatch.setattr(
        manager,
        "sessions",
        lambda _: [{"pid": os.getpid(), "state": "running", "process_created": 0}],
    )
    with pytest.raises(ControlError, match="process_identity_unavailable"):
        manager.active_sessions("920000009")


def test_legacy_detected_requirements_are_optional_but_explicit_profiles_are_preserved(
    tmp_path, monkeypatch
):
    manager = ProcessManager(tmp_path)
    spec = {
        "command": [sys.executable, "main.py"],
        "cwd": str(tmp_path),
        "required_env": ["BOT_TOKEN"],
    }
    monkeypatch.setattr(manager, "sessions", lambda _: [{"launch_hint": json.dumps(spec)}])
    assert manager.profile("920000009")["profile"]["required_env"] == []
    manager.save_profile("920000009", spec)
    assert manager.profile("920000009")["profile"]["required_env"] == ["BOT_TOKEN"]


def test_stop_during_interpreter_startup_is_cooperative(complex_bot):
    manager, bot_id, *_ = complex_bot
    manager.control(bot_id, "start")
    wait_for(lambda: manager.latest_run(bot_id)["status"] == "running")
    # No SDK session exists yet; the launcher must cancel or deliver stop after registration.
    assert manager.control(bot_id, "stop")["status"] == "stopped"
    assert not manager.active_sessions(bot_id)


def test_cooperative_stop_retries_temporary_mailbox_write_lock(complex_bot):
    manager, bot_id, *_ = complex_bot
    manager.control(bot_id, "start")
    wait_for(lambda: manager.active_sessions(bot_id))
    locked = threading.Event()

    def hold_writer():
        with sqlite3.connect(manager.directory / f"bot-{bot_id}.sqlite3", timeout=3) as connection:
            connection.execute("BEGIN IMMEDIATE")
            locked.set()
            time.sleep(0.6)

    with ThreadPoolExecutor(max_workers=1) as pool:
        writer = pool.submit(hold_writer)
        assert locked.wait(timeout=5)
        assert manager.control(bot_id, "stop")["status"] == "stopped"
        writer.result(timeout=5)
    assert not manager.active_sessions(bot_id)


def test_explicit_stop_resolves_old_crashed_session_without_killing_reused_pid(complex_bot):
    manager, bot_id, *_ = complex_bot
    with sqlite3.connect(manager.directory / f"bot-{bot_id}.sqlite3") as connection:
        connection.execute("UPDATE sessions SET state='running', pid=2147483647 WHERE id='seed'")
    assert manager.control(bot_id, "stop")["status"] == "stopped"
    assert read_snapshot(manager.directory, {})["bots"][0]["state"] == "stopped"
