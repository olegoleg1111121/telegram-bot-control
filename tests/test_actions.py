import asyncio
import json
import sqlite3
import sys
import time

import pytest
from aiogram import Bot, Dispatcher

from telegram_bot_control import start
from telegram_bot_control.action_stats import read_actions
from telegram_bot_control.bridge import Bridge
from telegram_bot_control.config import DEFAULTS
from telegram_bot_control.custom_actions import CONTEXT
from telegram_bot_control.projects import inspect_project
from telegram_bot_control.store import Store, read_snapshot
from telegram_bot_control.testing import OfflineSession, make_update


def fixture_bot(directory, bot_id=900000111):
    bot = Bot(
        token=f"{bot_id}:OFFLINE_TEST_TOKEN_NOT_A_REAL_SECRET_123456789", session=OfflineSession()
    )
    dp = Dispatcher()
    monitor = start(
        bot=bot,
        dispatcher=dp,
        data_dir=directory,
        entrypoint=__file__,
        actions={"private:payload": "catalog.open"},
    )
    dp.update.outer_middleware(monitor.middleware())
    return bot, dp, monitor


async def test_explicit_events_idempotency_privacy_and_separate_update_counters(tmp_path):
    bot, dp, monitor = fixture_bot(tmp_path)
    await dp.emit_startup(bot=bot)
    try:
        assert monitor.track_action(
            "order.completed", user_id=987654321, event_id="opaque-operation-key", duration_ms=10
        )
        monitor.track_action(
            "order.completed", user_id=987654321, event_id="opaque-operation-key", duration_ms=50
        )
        monitor.track_action("report.generate", outcome="error", duration_ms=20)
        await monitor.flush()
        data = Bridge(tmp_path).call("action_analytics", {})
        assert data["summary"] == dict(count=2, users=1, errors=1, cancelled=0, avg_ms=15)
        assert read_snapshot(tmp_path, {})["totals"]["events"] == 0
        assert {x["label"] for x in read_snapshot(tmp_path, {})["actions"]} == {
            "order.completed",
            "report.generate",
        }
        for path in tmp_path.glob("*.sqlite3*"):
            content = path.read_bytes()
            for secret in (bot.token, "opaque-operation-key", "987654321"):
                assert secret.encode() not in content
    finally:
        await dp.emit_shutdown(bot=bot)
    assert not monitor.track_action("closed.event")


async def test_decorator_results_errors_cancel_and_no_argument_capture(tmp_path):
    bot, dp, monitor = fixture_bot(tmp_path)

    @monitor.action("report.generate")
    async def report(value):
        await asyncio.sleep(0.01)
        return value

    @monitor.action("sync.work")
    def sync_work(value):
        """Keep this metadata."""
        if value:
            raise ValueError(f"api_key=never-store-me {bot.token}")
        return 42

    @monitor.action("cancel.work")
    async def cancelled():
        raise asyncio.CancelledError

    @monitor.action("exit.work")
    def exiting():
        raise SystemExit(3)

    await dp.emit_startup(bot=bot)
    try:
        assert await report("PRIVATE_FUNCTION_ARGUMENT") == "PRIVATE_FUNCTION_ARGUMENT"
        assert sync_work(0) == 42
        assert sync_work.__name__ == "sync_work" and sync_work.__doc__ == "Keep this metadata."
        with pytest.raises(ValueError):
            sync_work(1)
        with pytest.raises(asyncio.CancelledError):
            await cancelled()
        with pytest.raises(SystemExit):
            exiting()
        await monitor.flush()
        data = read_actions(tmp_path, {})
        assert (
            data["summary"]["count"] == 5
            and data["summary"]["errors"] == 1
            and data["summary"]["cancelled"] == 2
        )
        failure = next(x for x in data["recent"] if x["outcome"] == "error")
        assert failure["error_type"] == "ValueError" and "ValueError" in failure["traceback"]
        assert next(x for x in data["recent"] if x["name"] == "report.generate")["duration_ms"] > 0
        serialized = json.dumps(data)
        assert all(
            secret not in serialized
            for secret in (bot.token, "never-store-me", "PRIVATE_FUNCTION_ARGUMENT")
        )
        assert read_snapshot(tmp_path, {})["totals"]["errors"] == 0
    finally:
        await dp.emit_shutdown(bot=bot)
    with pytest.raises(TypeError):

        @monitor.action("generator")
        def generator():
            yield 1


async def test_concurrent_context_callback_dedup_and_thread_inheritance(tmp_path):
    bots = [fixture_bot(tmp_path, 900000111 + i) for i in range(2)]
    for bot, dp, monitor in bots:
        # Bind the closure for each dispatcher, including a secondary monitor call.
        def register(dp, monitor, other):
            @dp.callback_query()
            @monitor.action("catalog.open")
            async def callback(event):
                await asyncio.sleep(0.01)
                monitor.track_action("payment.confirmed")
                await asyncio.to_thread(monitor.track_action, "thread.work")
                other.track_action("other.monitor")

        register(dp, monitor, bots[1 if bot.id == 900000111 else 0][2])
        await dp.emit_startup(bot=bot)
    try:
        await asyncio.gather(
            *(
                dp.feed_update(
                    bot, make_update(10 + i, callback="private:payload", user_id=501 + i)
                )
                for i, (bot, dp, _) in enumerate(bots)
            )
        )
        assert CONTEXT.get() is None
        await asyncio.gather(*(m.flush() for _, _, m in bots))
        for bot, _, _ in bots:
            data = read_actions(tmp_path, {"bot_id": str(bot.id)})
            assert data["summary"]["count"] == 4 and data["summary"]["users"] == 1
            assert next(x for x in data["actions"] if x["name"] == "other.monitor")["users"] == 0
            assert next(x for x in data["actions"] if x["name"] == "catalog.open")["count"] == 1
            assert read_snapshot(tmp_path, {"bot_id": str(bot.id)})["totals"]["callbacks"] == 1
        with sqlite3.connect(Store(tmp_path, bots[0][0].id).path) as c:
            first = c.execute(
                "SELECT user_key FROM action_events WHERE name='payment.confirmed'"
            ).fetchone()[0]
        with sqlite3.connect(Store(tmp_path, bots[1][0].id).path) as c:
            second = c.execute(
                "SELECT user_key FROM action_events WHERE name='payment.confirmed'"
            ).fetchone()[0]
        assert first != second
    finally:
        await asyncio.gather(*(dp.emit_shutdown(bot=bot) for bot, dp, _ in bots))


def write_events(store, rows):
    now = time.time()
    store.write(
        {"bot_id": store.path.stem[4:], "name": "Fixture"},
        dict(
            id="session",
            pid=0,
            started_at=now,
            last_seen=now,
            stopped_at=now,
            state="stopped",
            dropped=0,
            write_failures=0,
        ),
        rows,
    )


def action(index, ts, **extra):
    return (
        dict(
            id=f"action-{index}",
            ts=ts,
            kind="action",
            label="checkout.pay",
            user_id=100 + index % 2,
            outcome="success",
            duration_ms=10,
            source="custom",
        )
        | extra
    )


def test_filters_boundaries_zero_buckets_pagination_and_legacy_schema(tmp_path):
    now = int(time.time() // 60) * 60
    for bid in (900000111, 900000112):
        write_events(
            Store(tmp_path, bid),
            [action(i, now) for i in range(65)]
            + [
                action(100, now - 120, label="literal_underscore", outcome="error"),
                action(101, now + 60),
            ],
        )
    params = dict(since=now - 120, until=now + 60, bucket_seconds=60)
    result = read_actions(tmp_path, params)
    assert (
        result["total"] == 132
        and result["summary"]["errors"] == 2
        and result["summary"]["users"] == 4
    )
    assert [s["count"] for s in result["series"]] == [2, 0, 130]
    all_rows = []
    for offset in (0, 50, 100):
        all_rows += read_actions(tmp_path, params | {"offset": offset})["recent"]
    assert len(all_rows) == len({(r["bot_id"], r["id"]) for r in all_rows}) == 132
    assert (
        read_actions(tmp_path, params | {"name": "checkout.pay", "bot_id": "900000111"})["total"]
        == 65
    )
    assert read_actions(tmp_path, params | {"outcome": "error"})["total"] == 2
    assert read_actions(tmp_path, params | {"query": "_"})["total"] == 2
    assert read_actions(tmp_path, params | {"query": "%' OR 1=1"})["total"] == 0
    assert read_actions(tmp_path, params | {"source": "function"})["total"] == 0
    # Old SDK mailboxes have callback events but no new table.
    legacy = Store(tmp_path, 900000113)
    write_events(legacy, [action(1, now, kind="callback", label="legacy.open", outcome="handled")])
    with sqlite3.connect(legacy.path) as c:
        c.execute("DROP TABLE action_events")
    old = read_actions(tmp_path, params | {"bot_id": "900000113"})
    assert old["recent"][0]["name"] == "legacy.open" and old["recent"][0]["outcome"] == "success"
    assert not old["warnings"]


def test_actions_retention_preview_and_cleanup(tmp_path):
    old = time.time() - 10 * 86400
    write_events(Store(tmp_path, 900000111), [action(1, old), action(2, time.time())])
    bridge = Bridge(tmp_path)
    settings = DEFAULTS | {"statistics_days": 1}
    assert bridge.preview(settings)["action_events"] == 1
    assert bridge.cleanup(settings)["action_events"] == 1
    assert read_actions(tmp_path, {"since": 0})["total"] == 1


@pytest.mark.parametrize(
    "kwargs",
    [
        dict(name="contains spaces"),
        dict(name=""),
        dict(name="x", user_id=True),
        dict(name="x", user_id=-1),
        dict(name="x", duration_ms=float("nan")),
        dict(name="x", duration_ms=-1),
        dict(name="x", duration_ms=True),
        dict(name="x", event_id=""),
        dict(name="x", outcome="handled"),
    ],
)
def test_explicit_event_validation_does_not_enqueue(tmp_path, kwargs):
    _, _, monitor = fixture_bot(tmp_path)
    with pytest.raises(ValueError):
        monitor.track_action(**kwargs)
    assert not monitor._queue


def test_global_python_discovery_and_existing_venv_without_execution(tmp_path, monkeypatch):
    from telegram_bot_control import projects

    regular = tmp_path / "system-python"
    regular.write_text("do not execute")
    monkeypatch.setattr(projects.shutil, "which", lambda _: str(regular))
    monkeypatch.setattr(projects.sys, "_base_executable", str(regular))
    project = tmp_path / "bot"
    project.mkdir()
    result = inspect_project(str(project))
    assert result["interpreters"][0] == str(regular)
    assert result["interpreter_options"][0]["kind"] == "system"
    assert sys.executable in result["interpreters"]
    venv = project / ".venv" / "bin"
    venv.mkdir(parents=True)
    (venv / "python").write_text("not executable")
    result = inspect_project(str(project))
    assert result["interpreters"][0] == str(venv / "python")
    assert result["interpreter_options"][0]["kind"] == "project_venv"
