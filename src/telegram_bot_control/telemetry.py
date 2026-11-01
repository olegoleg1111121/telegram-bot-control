"""Non-invasive logging and measurements of the current bot process."""

from __future__ import annotations

import logging
import math
import os
import time
import uuid
from collections.abc import Callable
from typing import Any

import psutil

from .privacy import describe_error, redact


class LogCaptureHandler(logging.Handler):
    """Copy records without changing existing handlers, formatters or logger levels."""

    def __init__(self, record: Callable, secrets: list[str], level: int | str = logging.INFO):
        super().__init__(level)
        self.record = record
        self.secrets = secrets

    def emit(self, record: logging.LogRecord) -> None:
        if record.name.startswith("telegram_bot_control"):
            return  # A failed recorder must never recursively log into itself.
        try:
            trace = ""
            if record.exc_info and record.exc_info[1]:
                trace = describe_error(record.exc_info[1], self.secrets)["traceback"]
            self.record(
                {
                    "id": uuid.uuid4().hex,
                    "kind": "log",
                    "ts": record.created if math.isfinite(record.created) else time.time(),
                    "level": record.levelno,
                    "logger": redact(record.name, self.secrets)[:200],
                    "message": redact(record.getMessage(), self.secrets)[:4000],
                    "traceback": trace,
                    "source": "logging",
                }
            )
        except Exception:
            # Logging must not raise, print credentials or block the bot on storage I/O.
            pass


class ResourceSampler:
    def __init__(self):
        self.process = psutil.Process(os.getpid())
        self.previous: tuple[float, float] | None = None

    def sample(self) -> dict[str, Any] | None:
        try:
            with self.process.oneshot():
                cpu = self.process.cpu_times()
                consumed = cpu.user + cpu.system
                memory = self.process.memory_info().rss
                threads = self.process.num_threads()
            clock = time.monotonic()
            percent = None
            if self.previous and clock > self.previous[0]:
                percent = round(
                    max(0, consumed - self.previous[1]) / (clock - self.previous[0]) * 100, 2
                )
            self.previous = (clock, consumed)
            return {
                "id": uuid.uuid4().hex,
                "kind": "resource",
                "ts": time.time(),
                "pid": self.process.pid,
                "cpu_percent": percent,
                "rss_bytes": memory,
                "threads": threads,
            }
        except (psutil.Error, OSError, NotImplementedError):
            self.previous = None
            return None
