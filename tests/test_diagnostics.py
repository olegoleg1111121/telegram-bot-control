import asyncio
import io
import json
import logging
import os
import sqlite3
import sys
import time
from datetime import datetime, timezone
from types import SimpleNamespace

import psutil
import pytest

from telegram_bot_control.bridge import Bridge
from telegram_bot_control.config import DEFAULTS
from telegram_bot_control.processes import ControlError, ProcessManager, validate_profile
from telegram_bot_control.projects import inspect_project, integration_preview, register_project
from telegram_bot_control.store import Store, cleanup_connection, read_logs, read_snapshot
from telegram_bot_control.telemetry import ResourceSampler
from telegram_bot_control.testing import create_offline_bot


def wait_for(predicate, timeout=15):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        result = predicate()
        if result:
            return result
        time.sleep(0.05)
    raise AssertionError("Timed out waiting for supervised process")


async def test_existing_logger_handlers_threads_traceback_and_redaction(tmp_path):
    bot, dp, monitor = create_offline_bot(tmp_path)
    target = logging.getLogger("existing_bot_test")
    before = target.level, target.propagate, target.handlers[:]
    stream = io.StringIO()
    original = logging.StreamHandler(stream)
    target.setLevel(logging.DEBUG)
    target.propagate = False
    target.addHandler(original)
    capture = monitor.capture_logs(target, level="DEBUG")
    assert monitor.capture_logs(target, level="DEBUG") is capture
    assert target.level == logging.DEBUG and original in target.handlers
    try:
        await dp.emit_startup(bot=bot)
        await asyncio.to_thread(target.info, "Threaded %s", "existing logger")
        try:
            raise RuntimeError(f"token={bot.token} password=hidden-value")
        except RuntimeError:
            target.exception("An existing logger error")
        await monitor.flush()
        result = read_logs(tmp_path, {"bot_id": str(bot.id)})
        assert result["total"] == 2
        assert "RuntimeError" in result["items"][0]["traceback"]
        assert "hidden-value" not in json.dumps(result)
        assert bot.token not in json.dumps(result)
        assert "Threaded existing logger" in stream.getvalue()
        assert read_snapshot(tmp_path, {})["totals"]["events"] == 0
        assert read_logs(tmp_path, {"bot_id": str(bot.id), "level": 40})["total"] == 1
        assert read_logs(tmp_path, {"bot_id": str(bot.id), "query": "threaded"})["total"] == 1
        assert read_logs(tmp_path, {"bot_id": str(bot.id), "query": "%' OR 1=1"})["total"] == 0
    finally:
        await dp.emit_shutdown(bot=bot)
        target.removeHandler(original)
        target.setLevel(before[0])
        target.propagate = before[1]
        assert target.handlers == before[2]


async def test_loguru_sink_protocol_without_installing_loguru(tmp_path):
    bot, dp, monitor = create_offline_bot(tmp_path)
    await dp.emit_startup(bot=bot)
    message = SimpleNamespace(
        record={
            "time": datetime.now(timezone.utc),
            "level": SimpleNamespace(no=20),
            "name": "existing_loguru",
            "message": f"api_key=secretvalue token={bot.token}",
            "exception": None,
        }
    )
    await asyncio.to_thread(monitor.loguru_sink, message)
    await monitor.flush()
    result = read_logs(tmp_path, {"bot_id": str(bot.id)})
    assert result["items"][0]["source"] == "loguru"
    assert "secretvalue" not in json.dumps(result) and bot.token not in json.dumps(result)
    await dp.emit_shutdown(bot=bot)


async def test_resource_samples_survive_shutdown_and_belong_to_bot_pid(tmp_path):
    bot, dp, monitor = create_offline_bot(tmp_path)
    await dp.emit_startup(bot=bot)
    for _ in range(50):
        await monitor.flush()
        snapshot = read_snapshot(tmp_path, {"bot_id": str(bot.id)})
        if snapshot["bots"][0]["resources"]["latest"]:
            break
        await asyncio.sleep(0.02)
    point = snapshot["bots"][0]["resources"]["latest"]
    assert point["pid"] == os.getpid()
    assert point["rss_bytes"] > 0
    assert point["cpu_percent"] is None  # no invented 0% priming sample
    await dp.emit_shutdown(bot=bot)
    assert read_snapshot(tmp_path, {"bot_id": str(bot.id)})["bots"][0]["resources"]["series"]
    sampler = ResourceSampler()
    assert sampler.sample()["cpu_percent"] is None
    time.sleep(0.03)
    assert sampler.sample()["cpu_percent"] is not None


def test_project_discovery_does_not_read_env_or_execute_code(tmp_path):
    project = tmp_path / "Existing bot with spaces"
    project.mkdir()
    main = project / "main.py"
    main.write_text(
        "from aiogram import Bot, Dispatcher\nclient = Bot('do not execute')\nrouter = Dispatcher()\nraise RuntimeError('never execute')\n"
    )
    env = project / ".env"
    env.write_text("BOT_TOKEN=private-not-to-be-read")
    original = main.read_bytes()
    found = inspect_project(str(project))
    assert found["has_env"] and found["entrypoints"] == [str(main)]
    preview = integration_preview(project, str(main), tmp_path / "data")
    assert preview["names_detected"]
    assert "bot=client, dispatcher=router" in preview["snippet"]
    assert "private-not-to-be-read" not in json.dumps(found | preview)
    result = register_project(
        tmp_path / "data",
        {
            "bot_id": "951000001",
            "name": "My existing bot",
            "entrypoint": str(main),
            "interpreter": sys.executable,
            "profile": {"cwd": str(project), "command": [sys.executable, str(main)]},
        },
    )
    assert result["status"] == "registered"
    assert main.read_bytes() == original
    bridge = Bridge(tmp_path / "data")
    assert bridge.call("snapshot", {})["bots"][0]["state"] == "waiting"
    assert bridge.processes.latest_run("951000001") is None
    assert bridge.processes.profile("951000001")["profile"]["env_file"] == ""
    with pytest.raises(ControlError, match="entrypoint_not_found"):
        integration_preview(project, str(tmp_path / "outside.py"), tmp_path)


@pytest.fixture
def supervised(tmp_path):
    project = tmp_path / "Supervised bot"
    project.mkdir()
    script = project / "main.py"
    script.write_text("pass\n")
    directory = tmp_path / "data"
    bot_id = "951000002"
    register_project(
        directory,
        {
            "bot_id": bot_id,
            "name": "Supervisor test",
            "entrypoint": str(script),
            "interpreter": sys.executable,
            "profile": {"cwd": str(project), "command": [sys.executable, str(script)]},
        },
    )
    manager = ProcessManager(directory)
    yield manager, bot_id, project, script
    try:
        manager.control(bot_id, "stop", force=True)
    except (ControlError, psutil.Error):
        pass


def set_restart(manager, bot_id, **values):
    profile = manager.profile(bot_id)["profile"]
    profile["restart"] = {
        "enabled": True,
        "max_restarts": 2,
        "delay_seconds": 1,
        "max_delay_seconds": 2,
    } | values
    manager.save_profile(bot_id, profile)


def test_supervisor_crash_retry_limit_and_no_duplicate_launch(supervised):
    manager, bot_id, project, script = supervised
    script.write_text(
        "from pathlib import Path\np=Path('attempts')\np.write_text(p.read_text()+'x' if p.exists() else 'x')\nraise SystemExit(7)\n"
    )
    set_restart(manager, bot_id)
    manager.control(bot_id, "start")
    wait_for(lambda: manager.latest_run(bot_id)["status"] == "backoff")
    with pytest.raises(ControlError, match="already_starting"):
        manager.control(bot_id, "start")
    result = wait_for(
        lambda: run if (run := manager.latest_run(bot_id))["status"] == "failed" else None
    )
    assert result["error"] == "restart_limit_reached" and result["restarts"] == 2
    assert (project / "attempts").read_text() == "xxx"


def test_supervisor_stop_cancels_backoff(supervised):
    manager, bot_id, project, script = supervised
    script.write_text(
        "from pathlib import Path\nPath('attempts').write_text('once')\nraise SystemExit(3)\n"
    )
    set_restart(manager, bot_id, delay_seconds=5, max_delay_seconds=5)
    manager.control(bot_id, "start")
    wait_for(lambda: manager.latest_run(bot_id)["status"] == "backoff")
    assert manager.control(bot_id, "stop")["status"] == "stopped"
    assert manager.latest_run(bot_id)["next_retry_at"] is None
    assert (project / "attempts").read_text() == "once"


def test_supervisor_recovery_and_clean_exit_are_not_restarted(supervised):
    manager, bot_id, project, script = supervised
    script.write_text(
        "from pathlib import Path\np=Path('attempts')\nold=p.read_text() if p.exists() else ''\np.write_text(old+'x')\nraise SystemExit(0 if old else 2)\n"
    )
    set_restart(manager, bot_id)
    manager.control(bot_id, "start")
    result = wait_for(
        lambda: run if (run := manager.latest_run(bot_id))["status"] == "stopped" else None
    )
    assert result["restarts"] == 1 and result["exit_code"] == 0
    assert (project / "attempts").read_text() == "xx"


def test_restart_policy_rejects_unbounded_or_invalid_settings(tmp_path):
    for policy in ({"max_restarts": 0}, {"enabled": 1}, {"delay_seconds": 0}, {"anything": 1}):
        with pytest.raises(ControlError, match="invalid_restart_policy"):
            validate_profile({"command": [sys.executable], "cwd": str(tmp_path), "restart": policy})


def test_old_mailboxes_and_new_retention_are_compatible(supervised):
    manager, bot_id, *_ = supervised
    path = Store(manager.directory, bot_id).path
    with sqlite3.connect(path) as connection:
        connection.execute(
            "INSERT INTO logs VALUES ('old',?,20,'example','hello','','logging')",
            (time.time() - 10 * 86400,),
        )
        counts = cleanup_connection(connection, DEFAULTS)
        assert counts["logs"] == 1
        connection.executescript("DROP TABLE logs; DROP TABLE resources;")
    assert read_logs(manager.directory, {"bot_id": bot_id}) == {"items": [], "total": 0}
    assert (
        read_snapshot(manager.directory, {"bot_id": bot_id})["bots"][0]["resources"]["latest"]
        is None
    )


def test_launch_failure_before_sdk_has_full_stderr_and_unicode(supervised):
    manager, bot_id, _, script = supervised
    script.write_text(
        "import sys\nprint('Запуск проекта', flush=True)\nimport bot_control_missing_dependency_987654\n",
        encoding="utf-8",
    )
    manager.control(bot_id, "start")
    run = wait_for(
        lambda: run if (run := manager.latest_run(bot_id))["status"] == "failed" else None
    )
    assert run["exit_code"] == 1
    assert "ModuleNotFoundError" in run["diagnostics"]
    assert "bot_control_missing_dependency_987654" in run["diagnostics"]
    assert "Запуск проекта" in run["diagnostics"]
    assert "stderr" in run["diagnostics"] and "stdout" in run["diagnostics"]


def test_prepare_failure_retains_output_before_bot_starts(supervised):
    manager, bot_id, _, _ = supervised
    profile = manager.profile(bot_id)["profile"]
    profile["pre_start"] = [
        [
            sys.executable,
            "-c",
            "import sys; print('migration failed', file=sys.stderr); raise SystemExit(7)",
        ]
    ]
    manager.save_profile(bot_id, profile)
    manager.control(bot_id, "start")
    run = wait_for(
        lambda: run if (run := manager.latest_run(bot_id))["status"] == "failed" else None
    )
    assert run["error"] == "prepare_failed:1" and run["exit_code"] == 7
    assert "migration failed" in run["diagnostics"] and "prepare 1" in run["diagnostics"]


def test_launch_output_is_redacted_across_chunks_and_long_lines_are_bounded(supervised):
    manager, bot_id, project, script = supervised
    secret = "private-output-capture-fixture"
    (project / ".env").write_text(f"FIXTURE_SECRET={secret}\n")
    profile = manager.profile(bot_id)["profile"]
    profile["env_file"] = ".env"
    manager.save_profile(bot_id, profile)
    script.write_text(
        "import os,sys,time\nvalue=os.environ['FIXTURE_SECRET']\n"
        "sys.stderr.write(value[:10]);sys.stderr.flush();time.sleep(0.05)\n"
        "sys.stderr.write(value[10:]+'\\n');sys.stderr.flush()\n"
        "print('x'*20000)\n"
        "for i in range(3000):print('bounded line',i)\n"
        "time.sleep(0.4)\nprint('final startup failure',file=sys.stderr)\n"
        "sys.stderr.write(value[:10]);sys.stderr.flush();time.sleep(0.05)\n"
        "sys.stderr.write(value[10:]+'\\n');sys.stderr.flush()\n"
        "print(value[:10]+'\\x1b[31m'+value[10:]+'\\x1b[0m',file=sys.stderr)\nraise SystemExit(2)\n"
    )
    manager.control(bot_id, "start")
    run = wait_for(
        lambda: run if (run := manager.latest_run(bot_id))["status"] == "failed" else None
    )
    assert secret not in run["diagnostics"]
    assert len(run["diagnostics"]) <= 32768
    assert "final startup failure" in run["diagnostics"]
    assert "[REDACTED]" in run["diagnostics"]
    # The file containing the secret is configuration, not command-output storage.
    with sqlite3.connect(manager.path) as connection:
        assert all(
            secret not in row[0] for row in connection.execute("SELECT output FROM run_output")
        )
