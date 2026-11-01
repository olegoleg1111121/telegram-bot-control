"""A real aiogram bot, or an explicit offline fixture without a Telegram token."""

import argparse
import asyncio
import logging
import os

from aiogram import Bot, Dispatcher, F
from aiogram.filters import Command
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from telegram_bot_control import start
from telegram_bot_control.config import data_directory
from telegram_bot_control.testing import run_offline


async def main(offline: bool, directory: str | None, duration: float) -> None:
    if offline:
        await run_offline(data_directory(directory), duration=duration)
        return
    token = os.environ.get("BOT_TOKEN")
    if not token:
        raise SystemExit(
            "Set BOT_TOKEN for a real bot, or use --offline (no Telegram registration needed)."
        )
    bot = Bot(token=token)
    dp = Dispatcher()
    monitor = start(
        bot=bot,
        dispatcher=dp,
        data_dir=directory,
        actions={"catalog:open": "catalog.open"},
        capture_logs=True,
    )
    dp.update.outer_middleware(monitor.middleware())

    @dp.message(Command("start", "help"))
    async def welcome(message: Message) -> None:
        keyboard = InlineKeyboardMarkup(
            inline_keyboard=[[InlineKeyboardButton(text="Каталог", callback_data="catalog:open")]]
        )
        await message.answer(
            "Тестовый бот Bot Control. /error — контрольная ошибка.", reply_markup=keyboard
        )

    @dp.message(Command("error"))
    async def fail(message: Message) -> None:
        raise RuntimeError("Контрольная ошибка из тестового бота")

    @dp.callback_query(F.data == "catalog:open")
    async def catalog(callback: CallbackQuery) -> None:
        await callback.answer("Событие записано")

    @dp.message()
    async def echo(message: Message) -> None:
        await message.answer("Сообщение получено")

    try:
        if duration:
            try:
                await asyncio.wait_for(
                    dp.start_polling(bot, handle_signals=False), timeout=duration
                )
            except TimeoutError:
                pass
        else:
            await dp.start_polling(bot)
    finally:
        await bot.session.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser()
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--data-dir")
    parser.add_argument("--duration", type=float, default=0)
    args = parser.parse_args()
    asyncio.run(main(args.offline, args.data_dir, args.duration))
