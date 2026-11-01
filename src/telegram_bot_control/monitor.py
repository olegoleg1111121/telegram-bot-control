"""Aiogram integration: a bounded in-process recorder, never a local server."""

from __future__ import annotations

import asyncio
import inspect
import logging
import os
import re
import sqlite3
import sys
import threading
import time
import uuid
from collections import deque
from collections.abc import Callable
from pathlib import Path
from typing import Any

from aiogram import BaseMiddleware, Bot, Dispatcher
from aiogram.dispatcher.event.bases import UNHANDLED
from aiogram.types import Update

from .config import DEFAULTS, data_directory, load_settings
from .privacy import describe_error
from .store import Store
from .processes import runtime_identity
from .telemetry import LogCaptureHandler, ResourceSampler

logger = logging.getLogger(__name__)
COMMAND = re.compile(r"^/([A-Za-z0-9_]{1,32})(?:@[A-Za-z0-9_]+)?(?:\s|$)")
ACTION = re.compile(r"^[A-Za-z0-9_.-]{1,80}$")


class Monitor:
    def __init__(
        self,
        bot: Bot,
        dispatcher: Dispatcher,
        directory: Path,
        entrypoint: Path,
        actions: dict[str, str] | Callable[[str], str | None] | None,
        capacity: int,
        shutdown: Callable | None = None,
    ):
        self.bot = bot
        self.dispatcher = dispatcher
        self.directory = directory
        self.entrypoint = entrypoint
        self.actions = actions
        self.capacity = capacity
        self.session_id = uuid.uuid4().hex
        self.started_at = time.time()
        self.dropped = 0
        self.write_failures = 0
        self._queue: deque[dict[str, Any]] = deque()
        self._queue_lock = threading.Lock()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._log_handlers: list[tuple[logging.Logger, LogCaptureHandler]] = []
        self._resource_task: asyncio.Task | None = None
        self._wake = asyncio.Event()
        self._closing = False
        self._worker: asyncio.Task | None = None
        self._middleware: TelemetryMiddleware | None = None
        self._shutdown_callback = shutdown
        self._control_task: asyncio.Task | None = None
        self._stop_task: asyncio.Task | None = None
        self._identity = runtime_identity(bot.token)
        self._settings = dict(DEFAULTS)
        self._written = asyncio.Event()
        self._store = Store(directory, bot.id)
        self._metadata = {
            "bot_id": str(bot.id),
            "name": f"Bot {bot.id}",
            "username": "",
            "entrypoint": str(entrypoint),
            "directory": str(entrypoint.parent),
            "interpreter": sys.executable,
            "integration_pending": False,
        }

    async def _startup(self, **kwargs: Any) -> None:
        await self.connect()

    async def _shutdown(self, **kwargs: Any) -> None:
        await self.close()

    async def connect(self) -> None:
        if self._worker and not self._worker.done():
            return
        if self._closing:
            raise RuntimeError("A closed monitor cannot be restarted; create a new session")
        self._loop = asyncio.get_running_loop()
        try:
            user = await asyncio.wait_for(self.bot.me(), timeout=3)
            self._metadata.update(name=user.full_name, username=user.username or "")
        except Exception:
            # Bot ID is available locally; getMe failure must not stop the bot.
            logger.warning("Bot metadata unavailable; recording by Telegram ID")
        self._worker = asyncio.create_task(self._run(), name=f"bot-control-{self.bot.id}")
        self._control_task = asyncio.create_task(
            self._control_loop(), name=f"bot-control-commands-{self.bot.id}"
        )
        self._resource_task = asyncio.create_task(self._resources())
        self._wake.set()

    def capture_logs(
        self, logger: logging.Logger | str | None = None, *, level: int | str = logging.INFO
    ) -> LogCaptureHandler:
        """Opt in to logging capture. Configure the application's logger level normally."""
        target = logging.getLogger(logger) if isinstance(logger, str) or logger is None else logger
        for existing, handler in self._log_handlers:
            if existing is target:
                handler.setLevel(level)
                return handler
        handler = LogCaptureHandler(self.record, [self.bot.token], level)
        target.addHandler(handler)
        self._log_handlers.append((target, handler))
        return handler

    def loguru_sink(self, message: Any) -> None:
        """Use with loguru.logger.add(monitor.loguru_sink); Loguru stays optional."""
        from .privacy import redact

        try:
            record = message.record
            exception = record.get("exception")
            trace = ""
            if exception and exception.value:
                trace = describe_error(exception.value, [self.bot.token])["traceback"]
            self.record(
                {
                    "id": uuid.uuid4().hex,
                    "kind": "log",
                    "ts": record["time"].timestamp(),
                    "level": record["level"].no,
                    "logger": redact(record.get("name") or "loguru", [self.bot.token])[:200],
                    "message": redact(record["message"], [self.bot.token])[:4000],
                    "traceback": trace,
                    "source": "loguru",
                }
            )
        except Exception:
            pass

    async def _resources(self) -> None:
        sampler = ResourceSampler()
        while not self._closing:
            sample = await asyncio.to_thread(sampler.sample)
            if sample:
                self.record(sample | {"session_id": self.session_id})
            await asyncio.sleep(self._settings["resource_interval_seconds"])

    def middleware(self) -> "TelemetryMiddleware":
        if self._middleware is None:
            self._middleware = TelemetryMiddleware(self)
        return self._middleware

    def action_label(self, payload: str) -> str:
        try:
            value = (
                self.actions(payload)
                if callable(self.actions)
                else (self.actions or {}).get(payload)
            )
            return value if isinstance(value, str) and ACTION.fullmatch(value) else "callback"
        except Exception:
            return "callback"

    def record(self, event: dict[str, Any]) -> None:
        with self._queue_lock:
            if self._closing or len(self._queue) >= self.capacity:
                self.dropped += 1
                return
            wake = not self._queue
            self._queue.append(event)
        if wake and self._loop and not self._loop.is_closed():
            try:
                self._loop.call_soon_threadsafe(self._wake.set)
            except RuntimeError:
                pass

    def capture_error(self, error: BaseException, *, update_id: int | None = None) -> None:
        """Optional hook for exceptions swallowed by custom middleware/error handlers."""
        self.record(
            {
                "id": f"manual:{self.session_id}:{update_id if update_id is not None else uuid.uuid4().hex}",
                "ts": time.time(),
                "kind": "error",
                "label": "",
                "outcome": "error",
                "duration_ms": 0,
                "error": describe_error(error, [self.bot.token]),
            }
        )

    async def flush(self, timeout: float = 5) -> None:
        if not self._worker:
            return
        self._written.clear()
        self._wake.set()
        await asyncio.wait_for(self._written.wait(), timeout)

    async def close(self) -> None:
        if self._closing:
            return
        self._closing = True
        for target, handler in self._log_handlers:
            target.removeHandler(handler)
            handler.close()
        self._log_handlers.clear()
        if self._resource_task:
            self._resource_task.cancel()
            await asyncio.gather(self._resource_task, return_exceptions=True)
        if self._control_task:
            self._control_task.cancel()
            await asyncio.gather(self._control_task, return_exceptions=True)
        self._wake.set()
        if self._worker:
            try:
                await asyncio.wait_for(asyncio.shield(self._worker), timeout=5)
            except TimeoutError:
                self._worker.cancel()
                await asyncio.gather(self._worker, return_exceptions=True)
                logger.warning("Monitor shutdown timed out; some telemetry was not persisted")

    async def _run(self) -> None:
        pending: list[dict[str, Any]] = []
        delay = 0.1
        while True:
            if not pending:
                try:
                    await asyncio.wait_for(self._wake.wait(), self._settings["heartbeat_seconds"])
                except TimeoutError:
                    pass
                self._wake.clear()
                # One bounded batch; writes happen off the bot's event loop.
                with self._queue_lock:
                    pending = [self._queue.popleft() for _ in range(min(256, len(self._queue)))]
            stopping = self._closing and not self._queue
            session = {
                "id": self.session_id,
                "pid": os.getpid(),
                "started_at": self.started_at,
                "last_seen": time.time(),
                "stopped_at": time.time() if stopping else None,
                "state": "stopped" if stopping else "running",
                "dropped": self.dropped,
                "write_failures": self.write_failures,
                "process_identity": self._identity,
            }
            try:

                def persist() -> dict[str, Any]:
                    self._store.write(self._metadata, session, pending)
                    return load_settings(self.directory)

                self._settings = await asyncio.to_thread(persist)
            except Exception:
                self.write_failures += 1
                if self.write_failures == 1:
                    logger.warning("Telemetry storage unavailable; bounded retry enabled")
                await asyncio.sleep(delay)
                delay = min(5, delay * 2)
                continue
            pending = []
            delay = 0.1
            if not self._queue:
                self._written.set()
            else:
                self._wake.set()
            if stopping:
                return

    async def _control_loop(self) -> None:
        def claim() -> bool:
            if not self._store.path.exists():
                return False
            connection = sqlite3.connect(self._store.path, timeout=0.1)
            try:
                with connection:
                    row = connection.execute(
                        "SELECT id FROM control_requests WHERE session_id=? AND action='stop' "
                        "AND status='pending' AND expires>? LIMIT 1",
                        (self.session_id, time.time()),
                    ).fetchone()
                    if row:
                        connection.execute(
                            "UPDATE control_requests SET status='acknowledged' WHERE id=?",
                            (row[0],),
                        )
                        return True
                return False
            finally:
                connection.close()

        async def stop() -> None:
            try:
                if self._shutdown_callback:
                    result = self._shutdown_callback()
                    if inspect.isawaitable(result):
                        await result
                else:
                    await self.dispatcher.stop_polling()
            except Exception:
                logger.warning("No cooperative shutdown hook available for this bot runtime")

        while not self._closing:
            try:
                requested = await asyncio.to_thread(claim)
                if requested and (not self._stop_task or self._stop_task.done()):
                    self._stop_task = asyncio.create_task(stop())
            except (sqlite3.Error, OSError):
                pass
            await asyncio.sleep(0.3)


class TelemetryMiddleware(BaseMiddleware):
    def __init__(self, monitor: Monitor):
        self.monitor = monitor

    async def __call__(self, handler: Callable, event: Update, data: dict[str, Any]) -> Any:
        # Prevent double counting if the same instance is accidentally registered twice.
        guard = f"_bot_control_{id(self.monitor)}"
        if (
            data.get(guard)
            or not isinstance(event, Update)
            or getattr(data.get("bot"), "id", self.monitor.bot.id) != self.monitor.bot.id
        ):
            return await handler(event, data)
        data[guard] = True
        message = event.message or event.edited_message
        callback = event.callback_query
        user = callback.from_user if callback else (message.from_user if message else None)
        label, kind = "", "update"
        if message:
            kind = "message"
            command = COMMAND.match(message.text or "")
            if command:
                kind, label = "command", "/" + command.group(1).lower()
        elif callback:
            kind, label = "callback", self.monitor.action_label(callback.data or "")
        record: dict[str, Any] = {
            "id": f"update:{event.update_id}",
            "ts": time.time(),
            "kind": kind,
            "label": label,
            "user_id": user.id if user and not user.is_bot else None,
            "outcome": "handled",
            "duration_ms": 0,
        }
        started = time.perf_counter()
        try:
            result = await handler(event, data)
            if result is UNHANDLED:
                record["outcome"] = "unhandled"
            return result
        except asyncio.CancelledError:
            record["outcome"] = "cancelled"
            raise
        except Exception as error:
            record["outcome"] = "error"
            record["error"] = describe_error(error, [self.monitor.bot.token])
            raise
        finally:
            record["duration_ms"] = (time.perf_counter() - started) * 1000
            self.monitor.record(record)


def start(
    *,
    bot: Bot,
    dispatcher: Dispatcher,
    data_dir: str | Path | None = None,
    entrypoint: str | Path | None = None,
    actions: dict[str, str] | Callable[[str], str | None] | None = None,
    queue_capacity: int = 10000,
    shutdown: Callable | None = None,
    capture_logs: bool = False,
) -> Monitor:
    """Register lifecycle hooks. Explicitly attach monitor.middleware() afterwards.

    The first actual write occurs at dispatcher startup, not at import time.
    For webhook/manual feed_update integrations call dispatcher.emit_startup/shutdown.
    """
    existing = getattr(dispatcher, "_bot_control_monitors", {})
    if bot.id in existing:
        return existing[bot.id]
    if type(queue_capacity) is not int or not 1 <= queue_capacity <= 100000:
        raise ValueError("queue_capacity must be between 1 and 100000")
    if entrypoint is None:
        frame = inspect.currentframe()
        try:
            filename = frame.f_back.f_globals.get("__file__") if frame and frame.f_back else None
            if not filename:
                raise ValueError("Set entrypoint explicitly when running interactively")
            entrypoint = filename
        finally:
            del frame
    monitor = Monitor(
        bot,
        dispatcher,
        data_directory(data_dir),
        Path(entrypoint).resolve(),
        actions,
        queue_capacity,
        shutdown,
    )
    existing[bot.id] = monitor
    dispatcher._bot_control_monitors = existing
    dispatcher.startup.register(monitor._startup)
    dispatcher.shutdown.register(monitor._shutdown)
    if capture_logs:
        monitor.capture_logs()
    return monitor
