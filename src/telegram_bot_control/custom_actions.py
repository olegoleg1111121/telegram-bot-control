"""Explicit analytics events; no commands or arbitrary payloads are executed/stored."""

from __future__ import annotations

import asyncio
import contextvars
import functools
import inspect
import math
import re
import time
import uuid
from typing import Any

from .privacy import describe_error

NAME = re.compile(r"^[A-Za-z0-9_.-]{1,80}$")
CONTEXT: contextvars.ContextVar[tuple[int, int | None, str] | None] = contextvars.ContextVar(
    "bot_control_action_context", default=None
)


def validate_name(name: str) -> str:
    if not isinstance(name, str) or not NAME.fullmatch(name):
        raise ValueError("Action name: use a static identifier of 1–80 letters, digits, _, . or -")
    return name


def track(
    monitor,
    name: str,
    *,
    user_id: int | None = None,
    outcome: str = "success",
    duration_ms: float = 0,
    event_id: str | None = None,
    error: Exception | None = None,
    source: str = "custom",
    started_at: float | None = None,
) -> bool:
    name = validate_name(name)
    if outcome not in ("success", "error", "cancelled"):
        raise ValueError("Action outcome must be success, error or cancelled")
    if (
        isinstance(duration_ms, bool)
        or not isinstance(duration_ms, (int, float))
        or not math.isfinite(duration_ms)
        or duration_ms < 0
    ):
        raise ValueError("duration_ms must be a finite nonnegative number")
    context = CONTEXT.get()
    origin = ""
    if context and context[0] == id(monitor):
        origin = context[2]
        if user_id is None:
            user_id = context[1]
    if user_id is not None and (type(user_id) is not int or not 0 < user_id < 2**63):
        raise ValueError("user_id must be a positive Telegram user ID or None")
    if event_id is not None and (not isinstance(event_id, str) or not NAME.fullmatch(event_id)):
        raise ValueError("event_id must be an opaque identifier of 1–80 safe characters")
    row: dict[str, Any] = {
        "id": f"action:{name}:{event_id}" if event_id else "action:" + uuid.uuid4().hex,
        "ts": time.time() if started_at is None else started_at,
        "kind": "action",
        "label": name,
        "user_id": user_id,
        "outcome": outcome,
        "duration_ms": float(duration_ms),
        "source": source,
        "update_id": origin,
    }
    if error:
        row["error"] = describe_error(error, [monitor.bot.token])
    return monitor.record(row)


def decorate(monitor, name: str):
    validate_name(name)

    def wrap(function):
        if inspect.isgeneratorfunction(function) or inspect.isasyncgenfunction(function):
            raise TypeError(
                "Action decorators support normal def and async def functions, not generators"
            )

        def finish(started, clock, outcome, error):
            track(
                monitor,
                name,
                outcome=outcome,
                duration_ms=(time.perf_counter() - clock) * 1000,
                error=error,
                source="function",
                started_at=started,
            )

        if inspect.iscoroutinefunction(function):

            @functools.wraps(function)
            async def async_action(*args, **kwargs):
                started, clock, outcome, error = time.time(), time.perf_counter(), "success", None
                try:
                    return await function(*args, **kwargs)
                except (asyncio.CancelledError, KeyboardInterrupt, SystemExit):
                    outcome = "cancelled"
                    raise
                except Exception as caught:
                    outcome, error = "error", caught
                    raise
                finally:
                    finish(started, clock, outcome, error)

            return async_action

        @functools.wraps(function)
        def sync_action(*args, **kwargs):
            started, clock, outcome, error = time.time(), time.perf_counter(), "success", None
            try:
                return function(*args, **kwargs)
            except (asyncio.CancelledError, KeyboardInterrupt, SystemExit):
                outcome = "cancelled"
                raise
            except Exception as caught:
                outcome, error = "error", caught
                raise
            finally:
                finish(started, clock, outcome, error)

        return sync_action

    return wrap
