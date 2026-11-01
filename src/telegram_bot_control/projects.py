"""Read-only project discovery and explicit registration. Never imports bot code."""

from __future__ import annotations

import ast
import os
import sys
import time
import uuid
from pathlib import Path
from typing import Any

from .processes import ControlError, ProcessManager, validate_profile
from .store import Store, mailbox_path


def inspect_project(value: str) -> dict[str, Any]:
    directory = Path(value).expanduser().resolve()
    if not directory.is_dir():
        raise ControlError("working_directory_not_found")
    candidates = []
    # Deliberately shallow: no .env contents, virtualenv scans or code execution.
    for name in ("main.py", "bot.py", "app.py", "__main__.py", "src/main.py"):
        path = directory / name
        if path.is_file() and path.resolve().is_relative_to(directory):
            candidates.append(str(path))
    python = []
    for venv in (".venv", "venv", "env"):
        for suffix in ("Scripts/python.exe", "bin/python"):
            path = directory / venv / suffix
            if path.is_file():
                python.append(str(path))
    if sys.executable not in python:
        python.append(sys.executable)
    return {
        "directory": str(directory),
        "entrypoints": candidates,
        "interpreters": python,
        "has_env": (directory / ".env").is_file(),
        "dependencies": [
            name
            for name in ("requirements.txt", "pyproject.toml", "uv.lock", "poetry.lock")
            if (directory / name).is_file()
        ],
    }


def integration_preview(directory: Path, entrypoint: str, data_dir: Path) -> dict[str, Any]:
    path = Path(entrypoint)
    if not path.is_absolute():
        path = directory / path
    path = path.resolve()
    if not path.is_relative_to(directory) or not path.is_file() or path.suffix != ".py":
        raise ControlError("entrypoint_not_found")
    if path.stat().st_size > 1024 * 1024:
        raise ControlError("entrypoint_too_large")
    try:
        tree = ast.parse(path.read_text(encoding="utf-8-sig"))
    except (SyntaxError, UnicodeError):
        raise ControlError("entrypoint_parse_failed") from None
    bot, dispatcher = "bot", "dp"
    detected = set()
    integrated = False
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and (node.module or "").startswith(
            "telegram_bot_control"
        ):
            integrated = True
        if isinstance(node, (ast.Assign, ast.AnnAssign)) and isinstance(node.value, ast.Call):
            function = node.value.func
            name = function.id if isinstance(function, ast.Name) else getattr(function, "attr", "")
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            if targets and isinstance(targets[0], ast.Name):
                if name == "Bot":
                    bot = targets[0].id
                    detected.add("bot")
                if name == "Dispatcher":
                    dispatcher = targets[0].id
                    detected.add("dispatcher")
    import json

    snippet = (
        "from telegram_bot_control import start\n\n"
        f"monitor = start(bot={bot}, dispatcher={dispatcher},\n"
        f"                data_dir={json.dumps(str(data_dir), ensure_ascii=False)},\n"
        "                capture_logs=True)\n"
        f"{dispatcher}.update.outer_middleware(monitor.middleware())"
    )
    return {
        "entrypoint": str(path),
        "snippet": snippet,
        "already_imported": integrated,
        "names_detected": len(detected) == 2,
        "bot_variable": bot,
        "dispatcher_variable": dispatcher,
    }


def register_project(data_dir: Path, params: dict[str, Any]) -> dict[str, Any]:
    bot_id = str(params["bot_id"]).strip()
    path = mailbox_path(data_dir, bot_id)
    if bot_id == "0" or path.exists():
        raise ControlError("bot_already_registered" if path.exists() else "invalid_bot_id")
    profile = validate_profile(params["profile"])
    preview = integration_preview(Path(profile["cwd"]), str(params["entrypoint"]), data_dir)
    interpreter = str(params["interpreter"])
    if not Path(interpreter).is_absolute() or not Path(interpreter).is_file():
        raise ControlError("interpreter_not_found")
    name = str(params.get("name", "")).strip()[:100] or f"Bot {bot_id}"
    from .privacy import redact

    if redact(name) != name:
        raise ControlError("secret_in_profile_use_env_file")
    ProcessManager(data_dir).save_profile(bot_id, profile)
    now = time.time()
    Store(data_dir, bot_id).write(
        {
            "bot_id": bot_id,
            "name": name,
            "username": "",
            "directory": profile["cwd"],
            "entrypoint": preview["entrypoint"],
            "interpreter": interpreter,
            "integration_pending": True,
        },
        {
            "id": "registered:" + uuid.uuid4().hex,
            "pid": 0,
            "started_at": now,
            "last_seen": now,
            "stopped_at": now,
            "state": "stopped",
            "dropped": 0,
            "write_failures": 0,
        },
        [],
    )
    if os.name != "nt":
        path.chmod(0o600)
    return {"bot_id": bot_id, "status": "registered", "snippet": preview["snippet"]}
