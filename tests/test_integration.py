import asyncio

import pytest
from aiogram import Bot, Dispatcher

from telegram_bot_control import start
from telegram_bot_control.config import load_settings, save_settings
from telegram_bot_control.store import read_snapshot
from telegram_bot_control.testing import OfflineSession, create_offline_bot, make_update


async def test_real_aiogram_pipeline_privacy_dedup_and_shutdown(tmp_path):
    bot, dp, monitor = create_offline_bot(tmp_path)
    assert not list(tmp_path.iterdir())  # start() only registers lifecycle hooks.
    await dp.emit_startup(bot=bot)
    for update in [
        make_update(1, text="/start", user_id=101),
        make_update(2, text="PRIVATE_MESSAGE_982345", user_id=101),
        make_update(3, callback="catalog:open:private", user_id=102),
        make_update(3, callback="catalog:open:private", user_id=102),
    ]:
        await dp.feed_update(bot, update)
    with pytest.raises(RuntimeError, match="Контрольная ошибка"):
        await dp.feed_update(bot, make_update(4, text="/error", user_id=102))
    await monitor.flush()
    data = read_snapshot(tmp_path, {})
    assert len(data["bots"]) == 1
    assert data["totals"]["events"] == 4
    assert data["totals"]["messages"] == 3
    assert data["totals"]["callbacks"] == 1
    assert data["totals"]["users"] == 2
    assert data["totals"]["errors"] == 1
    assert data["actions"] == [{"label": "catalog.open", "count": 1}]
    assert data["bots"][0]["state"] == "running"
    assert "test_bot" in data["bots"][0]["entrypoint"]
    assert "RuntimeError" in data["errors"][0]["traceback"]
    for file in tmp_path.glob("*.sqlite3*"):
        content = file.read_bytes()
        assert b"PRIVATE_MESSAGE_982345" not in content
        assert b"catalog:open:private" not in content
        assert bot.token.encode() not in content
    await dp.emit_shutdown(bot=bot)
    assert read_snapshot(tmp_path, {})["bots"][0]["state"] == "stopped"
    await bot.session.close()


async def test_error_handler_does_not_hide_middleware_error(tmp_path):
    bot, dp, monitor = create_offline_bot(tmp_path)

    @dp.errors()
    async def handled(event):
        return True

    await dp.emit_startup(bot=bot)
    assert await dp.feed_update(bot, make_update(1, text="/error")) is True
    await monitor.flush()
    assert read_snapshot(tmp_path, {})["totals"]["errors"] == 1
    await dp.emit_shutdown(bot=bot)


async def test_duplicate_start_and_duplicate_middleware(tmp_path):
    bot, dp, monitor = create_offline_bot(tmp_path)
    assert start(bot=bot, dispatcher=dp, data_dir=tmp_path) is monitor
    dp.update.outer_middleware(monitor.middleware())
    await dp.emit_startup(bot=bot)
    await dp.feed_update(bot, make_update(1))
    await monitor.flush()
    assert read_snapshot(tmp_path, {})["totals"]["events"] == 1
    await dp.emit_shutdown(bot=bot)


async def test_storage_failure_is_bounded_and_does_not_break_bot(tmp_path, monkeypatch):
    bot, dp, monitor = create_offline_bot(tmp_path)
    monitor.capacity = 2
    original = monitor._store.write

    def broken(*args):
        raise OSError("disk unavailable")

    monkeypatch.setattr(monitor._store, "write", broken)
    await dp.emit_startup(bot=bot)
    for index in range(20):
        await dp.feed_update(bot, make_update(index))
    await asyncio.sleep(0.15)
    assert len(monitor._queue) <= 2
    assert monitor.dropped > 0
    assert monitor.write_failures > 0
    monkeypatch.setattr(monitor._store, "write", original)
    await monitor.flush()
    await dp.emit_shutdown(bot=bot)
    data = read_snapshot(tmp_path, {})
    assert data["bots"][0]["dropped"] > 0
    assert data["bots"][0]["state"] == "stopped"


async def test_multiple_bots_do_not_share_events(tmp_path):
    dp = Dispatcher()
    bots = [
        Bot(
            token=f"{900000010 + i}:OFFLINE_TEST_TOKEN_NOT_A_REAL_SECRET_123456789",
            session=OfflineSession(),
        )
        for i in range(2)
    ]
    monitors = [
        start(bot=bot, dispatcher=dp, data_dir=tmp_path, entrypoint=__file__) for bot in bots
    ]
    for monitor in monitors:
        dp.update.outer_middleware(monitor.middleware())

    @dp.message()
    async def handler(message):
        return "ok"

    await dp.emit_startup(bot=bots[0])
    for index, bot in enumerate(bots):
        await dp.feed_update(bot, make_update(index))
    await asyncio.gather(*(monitor.flush() for monitor in monitors))
    data = read_snapshot(tmp_path, {})
    assert len(data["bots"]) == 2
    assert all(bot["metrics"]["events"] == 1 for bot in data["bots"])
    await dp.emit_shutdown(bot=bots[0])


async def test_heartbeat_updates_without_user_events(tmp_path):
    settings = load_settings(tmp_path) | {"heartbeat_seconds": 1, "connection_timeout_seconds": 3}
    save_settings(tmp_path, settings)
    bot, dp, monitor = create_offline_bot(tmp_path)
    await dp.emit_startup(bot=bot)
    await monitor.flush()
    before = read_snapshot(tmp_path, {})["bots"][0]["last_seen"]
    await asyncio.sleep(1.2)
    after = read_snapshot(tmp_path, {})["bots"][0]
    assert after["last_seen"] > before
    assert after["state"] == "running"
    assert after["metrics"]["events"] == 0
    await dp.emit_shutdown(bot=bot)
