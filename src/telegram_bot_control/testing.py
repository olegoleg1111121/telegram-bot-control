"""Explicit offline aiogram fixture. Never contacts Telegram."""

from __future__ import annotations

import asyncio
import random
import time
from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from aiogram import Bot, Dispatcher, F
from aiogram.client.session.base import BaseSession
from aiogram.filters import Command
from aiogram.methods import AnswerCallbackQuery, GetMe, SendMessage
from aiogram.types import CallbackQuery, Chat, Message, Update, User

from . import start

FAKE_TOKEN = "900000001:" + "OFFLINE_TEST_TOKEN_NOT_A_REAL_SECRET_123456789"


class OfflineSession(BaseSession):
    async def close(self) -> None:
        pass

    async def make_request(self, bot: Bot, method: Any, timeout: int | None = None) -> Any:
        if isinstance(method, GetMe):
            return User(
                id=bot.id,
                is_bot=True,
                first_name=f"Тестовый бот · {bot.id % 1000:02}",
                username=f"offline_bot_{bot.id}",
            )
        if isinstance(method, SendMessage):
            return Message(
                message_id=1,
                date=datetime.now(timezone.utc),
                chat=Chat(id=int(method.chat_id), type="private"),
                text=method.text,
            )
        if isinstance(method, AnswerCallbackQuery):
            return True
        raise RuntimeError(f"Offline session does not implement {type(method).__name__}")

    async def stream_content(self, *args: Any, **kwargs: Any) -> AsyncGenerator[bytes, None]:
        raise RuntimeError("Network access is disabled in offline mode")
        yield b""  # pragma: no cover


def make_update(
    update_id: int, *, text: str = "Привет", user_id: int = 101, callback: str | None = None
) -> Update:
    user = User(id=user_id, is_bot=False, first_name="Offline user")
    if callback is not None:
        return Update(
            update_id=update_id,
            callback_query=CallbackQuery(
                id=str(update_id), from_user=user, chat_instance="offline", data=callback
            ),
        )
    return Update(
        update_id=update_id,
        message=Message(
            message_id=update_id,
            date=datetime.now(timezone.utc),
            chat=Chat(id=user_id, type="private"),
            from_user=user,
            text=text,
        ),
    )


def create_offline_bot(directory: Path, *, bot_id: int = 900000001):
    token = f"{bot_id}:OFFLINE_TEST_TOKEN_NOT_A_REAL_SECRET_123456789"
    bot = Bot(token=token, session=OfflineSession())
    dispatcher = Dispatcher()
    monitor = start(
        bot=bot,
        dispatcher=dispatcher,
        data_dir=directory,
        entrypoint=Path(__file__).parents[2] / "examples/test_bot/main.py",
        actions={"catalog:open:private": "catalog.open", "settings:open": "settings.open"},
    )
    dispatcher.update.outer_middleware(monitor.middleware())

    @dispatcher.message(Command("error"))
    async def broken(message: Message) -> None:
        raise RuntimeError("Контрольная ошибка тестового обработчика")

    @dispatcher.message()
    async def message_handler(message: Message) -> None:
        await message.answer("Offline response")

    @dispatcher.callback_query(F.data)
    async def callback_handler(callback: CallbackQuery) -> None:
        await callback.answer()

    return bot, dispatcher, monitor


async def run_offline(
    directory: Path, *, duration: float = 0, interval: float = 0.8, bot_id: int = 900000001
) -> int:
    bot, dispatcher, monitor = create_offline_bot(directory, bot_id=bot_id)
    await dispatcher.emit_startup(bot=bot)
    count = 0
    base_id = time.time_ns() // 1000
    started = time.monotonic()
    print(f"OFFLINE aiogram bot {bot.id}; data: {directory}", flush=True)
    try:
        while not duration or time.monotonic() - started < duration:
            count += 1
            update_id = base_id + count
            user_id = 100 + count % 17
            if count % 13 == 0:
                update = make_update(update_id, text="/error", user_id=user_id)
            elif count % 3 == 0:
                update = make_update(update_id, callback="catalog:open:private", user_id=user_id)
            else:
                update = make_update(
                    update_id, text=random.choice(["/start", "/help", "Привет"]), user_id=user_id
                )
            try:
                await dispatcher.feed_update(bot, update)
            except RuntimeError:
                pass  # Deliberate fixture error; middleware must record it.
            await asyncio.sleep(interval)
    finally:
        await dispatcher.emit_shutdown(bot=bot)
        await bot.session.close()
    return count
