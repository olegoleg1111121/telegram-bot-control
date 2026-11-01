"""Shared on-disk configuration. No ports, services or registration server."""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any

DEFAULTS: dict[str, Any] = {
    "statistics_days": 365,
    "errors_days": 30,
    "diagnostics_days": 7,
    "logs_days": 7,
    "resources_days": 7,
    "resource_interval_seconds": 5,
    "heartbeat_seconds": 10,
    "connection_timeout_seconds": 30,
}


def data_directory(value: str | Path | None = None) -> Path:
    if value:
        return Path(value).expanduser().resolve()
    if os.environ.get("BOTCONTROL_HOME"):
        return Path(os.environ["BOTCONTROL_HOME"]).expanduser().resolve()
    if os.name == "nt":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData/Local"))
        return base / "TelegramBotControl"
    return (
        Path(os.environ.get("XDG_STATE_HOME", Path.home() / ".local/state"))
        / "telegram-bot-control"
    )


def ensure_private_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    if os.name != "nt":
        path.chmod(0o700)


def validate_settings(settings: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(settings, dict) or set(settings) - set(DEFAULTS):
        raise ValueError("Unknown settings")
    result = DEFAULTS | settings
    for key in (
        "statistics_days",
        "errors_days",
        "diagnostics_days",
        "logs_days",
        "resources_days",
    ):
        value = result[key]
        if value is not None and (type(value) is not int or not 1 <= value <= 36500):
            raise ValueError(f"{key}: expected 1–36500 or null")
    for key in ("heartbeat_seconds", "connection_timeout_seconds", "resource_interval_seconds"):
        if type(result[key]) is not int or not 1 <= result[key] <= 86400:
            raise ValueError(f"{key}: expected integer 1–86400")
    if result["connection_timeout_seconds"] < result["heartbeat_seconds"] * 3:
        raise ValueError("connection_timeout_seconds must be at least 3 × heartbeat_seconds")
    return result


def load_settings(directory: Path) -> dict[str, Any]:
    path = directory / "settings.json"
    if not path.exists():
        return dict(DEFAULTS)
    return validate_settings(json.loads(path.read_text(encoding="utf-8")))


def save_settings(directory: Path, settings: dict[str, Any]) -> dict[str, Any]:
    validated = validate_settings(settings)
    ensure_private_directory(directory)
    # Atomic replacement: running bots always see a complete configuration.
    fd, temporary = tempfile.mkstemp(prefix="settings-", suffix=".tmp", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(validated, stream, ensure_ascii=False, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, directory / "settings.json")
    finally:
        Path(temporary).unlink(missing_ok=True)
    return validated
