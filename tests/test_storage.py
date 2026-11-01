import json
import sqlite3
import subprocess
import sys
import time

import pytest

from telegram_bot_control.bridge import Bridge
from telegram_bot_control.config import DEFAULTS, load_settings, save_settings, validate_settings
from telegram_bot_control.privacy import describe_error
from telegram_bot_control.store import Store, read_snapshot, session_state


def write(store, events, *, session_id="one", started=None, state="running", name="Example"):
    now = time.time()
    store.write(
        {
            "bot_id": "123456",
            "name": name,
            "username": "example",
            "entrypoint": "/bots/main.py",
            "directory": "/bots",
            "interpreter": sys.executable,
        },
        {
            "id": session_id,
            "pid": 123,
            "started_at": started or now,
            "last_seen": now,
            "stopped_at": now if state == "stopped" else None,
            "state": state,
            "dropped": 0,
            "write_failures": 0,
        },
        events,
    )


def event(id, *, user=101, ts=None):
    return {
        "id": str(id),
        "ts": ts or time.time(),
        "kind": "message",
        "label": "",
        "user_id": user,
        "outcome": "handled",
        "duration_ms": 5,
    }


def test_unique_users_across_days_exact_boundaries_and_idempotency(tmp_path):
    now = time.time()
    store = Store(tmp_path, 123456)
    events = [event(1, ts=now - 86400), event(2), event(3, user=102)]
    write(store, events)
    write(store, events)
    data = read_snapshot(tmp_path, {"since": now - 90000, "until": now + 1})
    assert data["totals"]["events"] == 3
    assert data["totals"]["users"] == 2
    assert read_snapshot(tmp_path, {"since": now - 86400, "until": now})["totals"]["events"] == 1
    assert all(point["count"] == 0 for point in data["series"][:-25])


def test_sessions_persist_and_older_session_cannot_replace_metadata(tmp_path):
    store = Store(tmp_path, 123456)
    now = time.time()
    write(store, [], session_id="old", started=now - 20, name="old")
    write(store, [], session_id="new", started=now, name="new", state="stopped")
    write(store, [], session_id="old", started=now - 20, name="old", state="stopped")
    bot = read_snapshot(tmp_path, {})["bots"][0]
    assert bot["name"] == "new"
    assert len(bot["sessions"]) == 2
    assert bot["state"] == "stopped"
    assert session_state([{"state": "running", "last_seen": now - 40}], 30, now) == "disconnected"
    assert session_state([{"state": "running", "last_seen": now}], 30, now) == "running"


def test_retention_requires_confirmation_and_cleans_stopped_bots(tmp_path):
    store = Store(tmp_path, 123456)
    write(store, [event(1, ts=time.time() - 10 * 86400), event(2)], state="stopped")
    bridge = Bridge(tmp_path)
    settings = dict(DEFAULTS, statistics_days=7)
    assert bridge.call("preview_retention", {"settings": settings})["events"] == 1
    with pytest.raises(ValueError, match="confirm_cleanup"):
        bridge.call("save_settings", {"settings": settings})
    assert not (tmp_path / "settings.json").exists()
    result = bridge.call("save_settings", {"settings": settings, "confirm_cleanup": True})
    assert result["deleted"]["events"] == 1
    assert read_snapshot(tmp_path, {})["totals"]["events"] == 1
    assert load_settings(tmp_path)["statistics_days"] == 7


def test_settings_validation(tmp_path):
    for invalid in (
        {"statistics_days": 0},
        {"errors_days": True},
        {"other": 1},
        {"heartbeat_seconds": 20},
    ):
        with pytest.raises(ValueError):
            validate_settings(invalid)
    saved = save_settings(tmp_path, dict(DEFAULTS, statistics_days=None))
    assert saved == load_settings(tmp_path)
    assert saved["statistics_days"] is None


def test_errors_are_redacted_and_grouped(tmp_path):
    token = "123456:" + "ABCDEFGHIJKLMNOPQRSTUVWXYZ_123456789"
    error = RuntimeError(f"token={token} password=supersecret")
    details = describe_error(error, [token])
    store = Store(tmp_path, 123456)
    rows = [event(1), event(2)]
    for row in rows:
        row.update(outcome="error", error=details)
    write(store, rows)
    data = read_snapshot(tmp_path, {})
    assert data["error_groups"] == 1
    assert data["errors"][0]["count"] == 2
    assert token not in json.dumps(data)
    assert "supersecret" not in json.dumps(data)


def test_stdio_protocol_needs_no_socket_and_survives_invalid_request(tmp_path):
    payload = (
        "\n".join(
            [
                json.dumps({"id": 1, "method": "hello"}),
                "not json",
                json.dumps({"id": 2, "method": "snapshot"}),
                json.dumps({"id": 3, "method": "unknown"}),
            ]
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
            str(tmp_path),
        ],
        input=payload,
        text=True,
        encoding="utf-8",
        capture_output=True,
        timeout=15,
    )
    assert result.returncode == 0, result.stderr
    lines = [json.loads(line) for line in result.stdout.splitlines()]
    assert lines[0]["result"]["transport"] == "stdio"
    assert "error" in lines[1]
    assert lines[2]["result"]["bots"] == []
    assert "error" in lines[3]


def test_corrupt_mailbox_does_not_hide_healthy_bots(tmp_path):
    write(Store(tmp_path, 123456), [event(1)])
    (tmp_path / "bot-999.sqlite3").write_text("not a database")
    data = read_snapshot(tmp_path, {})
    assert len(data["bots"]) == 1
    assert data["meta"]["warnings"]
    assert Bridge(tmp_path).call("snapshot", {})["meta"]["warnings"]


def test_denied_directory_is_not_reported_as_empty_fleet(tmp_path, monkeypatch):
    import telegram_bot_control.store as storage

    def denied(*args):
        raise PermissionError("access denied")

    monkeypatch.setattr(storage.os, "scandir", denied)
    with pytest.raises(PermissionError):
        storage.read_snapshot(tmp_path, {})


def test_future_schema_is_not_overwritten(tmp_path):
    store = Store(tmp_path, 123456)
    write(store, [])
    with sqlite3.connect(store.path) as connection:
        connection.execute("PRAGMA user_version=99")
    with pytest.raises(ValueError, match="Unsupported"):
        write(store, [event(1)])
    with sqlite3.connect(store.path) as connection:
        assert connection.execute("PRAGMA user_version").fetchone()[0] == 99


def test_backup_includes_committed_wal_without_stopping_writer(tmp_path):
    from pathlib import Path

    source = tmp_path / "source"
    store = Store(source, 123456)
    write(store, [event(1)])
    from telegram_bot_control.processes import ProcessManager

    ProcessManager(source).save_profile(
        "123456", {"command": [sys.executable, "main.py"], "cwd": str(tmp_path)}
    )
    with sqlite3.connect(store.path) as writer:
        writer.execute("PRAGMA journal_mode=WAL")
        writer.execute(
            "INSERT INTO events VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("live-wal", time.time(), "message", "", None, "handled", 1),
        )
        writer.commit()
        assert Path(str(store.path) + "-wal").exists()
        target = tmp_path / "backup"
        result = subprocess.run(
            [
                sys.executable,
                "scripts/backup.py",
                "--data-dir",
                str(source),
                "--output",
                str(target),
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )
        assert result.returncode == 0, result.stderr
        assert read_snapshot(target, {})["totals"]["events"] == 2
        assert ProcessManager(target).profile("123456")["configured"] is True
