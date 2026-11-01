import argparse
import asyncio
import json
import logging
import os
import subprocess
import sys
import time
from pathlib import Path

from aiogram import Bot, Dispatcher, F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup

from telegram_bot_control import start
from telegram_bot_control.testing import OfflineSession, make_update


class Form(StatesGroup):
    name = State()


async def main(args):
    config = json.loads(Path(args.config).read_text(encoding="utf-8-sig"))
    if config.get("prepared") and not Path(config["prepared"]).exists():
        raise RuntimeError("Preparation step did not run")
    if config.get("required_flavor") != os.environ.get("BOT_FLAVOR"):
        raise RuntimeError("Environment was not restored")
    bot = Bot(
        token=f"{args.bot_id}:OFFLINE_TEST_TOKEN_NOT_A_REAL_SECRET_123456789",
        session=OfflineSession(),
    )
    dp = Dispatcher()
    root, forms = Router(), Router()
    root.include_router(forms)
    dp.include_router(root)
    stopped = asyncio.Event()
    monitor = start(
        bot=bot,
        dispatcher=dp,
        actions={"catalog:open:private": "catalog.open"},
        shutdown=(lambda: None) if args.ignore_stop else stopped.set,
    )
    dp.update.outer_middleware(monitor.middleware())
    app_logger = logging.getLogger("complex_fixture")
    app_logger.setLevel(logging.INFO)
    monitor.capture_logs(app_logger)

    @forms.message(Command("start"))
    async def welcome(message, state: FSMContext):
        await state.set_state(Form.name)
        await message.answer("What is your name?")

    @forms.message(Form.name)
    async def name(message, state: FSMContext):
        await state.update_data(name="not recorded in telemetry")
        await state.clear()
        monitor.track_action("form.completed")
        await message.answer("OK")

    @root.callback_query(F.data)
    @monitor.action("catalog.open")
    async def callback(event):
        await event.answer()

    @root.message(Command("error"))
    @monitor.action("fixture.failure")
    async def fail(message):
        raise RuntimeError("Complex fixture controlled error")

    @dp.errors()
    async def handled(error):
        return True

    worker = None
    if args.spawn_worker:
        worker = subprocess.Popen(
            [sys.executable, "-c", "import time; time.sleep(180)"],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
    report = {
        "pid": os.getpid(),
        "argv": sys.argv,
        "cwd": os.getcwd(),
        "label": args.label,
        "flavor": os.environ.get("BOT_FLAVOR"),
        "secret_present": bool(os.environ.get("FIXTURE_SECRET")),
        "launch_id": os.environ.get("BOTCONTROL_LAUNCH_ID"),
        "worker_pid": worker.pid if worker else None,
    }
    with open(args.report, "a", encoding="utf-8") as stream:
        stream.write(json.dumps(report, ensure_ascii=False) + "\n")
    await dp.emit_startup(bot=bot)
    await monitor.flush()
    app_logger.info("Bot is ready: existing logger connected")
    index = 0
    try:
        while not stopped.is_set():
            index += 1
            update_id = time.time_ns() // 1000
            if index % 4 == 1:
                update = make_update(update_id, text="/start")
            elif index % 4 == 2:
                update = make_update(update_id, text="PRIVATE COMPLEX FORM VALUE")
            elif index % 4 == 3:
                update = make_update(update_id, callback="catalog:open:private")
            else:
                update = make_update(update_id, text="/error")
            await dp.feed_update(bot, update)
            if index % 4 == 0:
                app_logger.info("Processed another batch of updates")
            try:
                await asyncio.wait_for(stopped.wait(), 0.15)
            except TimeoutError:
                pass
    finally:
        if worker:
            worker.kill()
            worker.wait(timeout=3)
        await dp.emit_shutdown(bot=bot)
        await bot.session.close()


def cli():
    parser = argparse.ArgumentParser()
    parser.add_argument("--bot-id", type=int, required=True)
    parser.add_argument("--config", required=True)
    parser.add_argument("--label", default="Complex bot")
    parser.add_argument("--report", required=True)
    parser.add_argument("--ignore-stop", action="store_true")
    parser.add_argument("--spawn-worker", action="store_true")
    asyncio.run(main(parser.parse_args()))


if __name__ == "__main__":
    cli()
