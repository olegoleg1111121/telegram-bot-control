"""A child process speaking JSON lines over stdin/stdout. Never opens a socket."""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import time
from pathlib import Path
from typing import Any

from . import __version__
from .config import data_directory, load_settings, save_settings, validate_settings
from .store import cleanup_connection, mailbox_files, read_snapshot, reader, read_logs, table_exists
from .processes import ProcessManager

MAX_LINE = 1024 * 1024


class Bridge:
    def __init__(self, directory: Path):
        self.directory = directory
        self._last_cleanup = 0.0
        self.processes = ProcessManager(directory)
        self.web_manager = None

    def close(self):
        if self.web_manager:
            self.web_manager.stop()

    def preview(self, settings: dict[str, Any]) -> dict[str, int]:
        result = {
            "events": 0,
            "action_events": 0,
            "errors": 0,
            "diagnostics": 0,
            "logs": 0,
            "resources": 0,
        }
        for path in mailbox_files(self.directory):
            connection = None
            try:
                connection = reader(path)
                for table, key in (
                    ("events", "statistics_days"),
                    ("action_events", "statistics_days"),
                    ("errors", "errors_days"),
                    ("diagnostics", "diagnostics_days"),
                    ("logs", "logs_days"),
                    ("resources", "resources_days"),
                ):
                    if settings[key] is not None and table_exists(connection, table):
                        result[table] += connection.execute(
                            f"SELECT COUNT(*) FROM {table} WHERE ts<?",
                            (time.time() - settings[key] * 86400,),
                        ).fetchone()[0]
            except (sqlite3.Error, ValueError):
                continue
            finally:
                if connection:
                    connection.close()
        return result

    def cleanup(self, settings: dict[str, Any]) -> dict[str, int]:
        result = {
            "events": 0,
            "action_events": 0,
            "errors": 0,
            "diagnostics": 0,
            "logs": 0,
            "resources": 0,
        }
        for path in mailbox_files(self.directory):
            connection = None
            try:
                connection = sqlite3.connect(path, timeout=0.3)
                deleted = cleanup_connection(connection, settings)
                for key in result:
                    result[key] += deleted[key]
            except sqlite3.Error:
                # Another bot may be flushing a batch; retry during the next sweep.
                continue
            finally:
                if connection:
                    connection.close()
        self._last_cleanup = time.monotonic()
        return result

    def call(self, method: str, params: dict[str, Any]) -> Any:
        if method == "action_analytics":
            from .action_stats import read_actions

            return read_actions(self.directory, params)
        if method == "logs":
            return read_logs(self.directory, params)
        if method == "inspect_project":
            from .projects import inspect_project, integration_preview

            project = inspect_project(str(params["directory"]))
            entrypoint = params.get("entrypoint") or next(iter(project["entrypoints"]), "")
            if entrypoint:
                project["integration"] = integration_preview(
                    Path(project["directory"]), str(entrypoint), self.directory
                )
            return project
        if method == "register_project":
            from .projects import register_project

            return register_project(self.directory, params)
        if method in ("web_status", "web_start", "web_stop"):
            from .web_manager import WebManager

            if self.web_manager is None:
                self.web_manager = WebManager(self.directory)
            if method == "web_start":
                return self.web_manager.start(
                    params.get("host", "127.0.0.1"), params.get("port", 8765)
                )
            if method == "web_stop":
                return self.web_manager.stop()
            return self.web_manager.status()
        if method == "hello":
            return {"version": __version__, "transport": "stdio", "data_dir": str(self.directory)}
        if method == "snapshot":
            if time.monotonic() - self._last_cleanup >= 60:
                self.cleanup(load_settings(self.directory))
            snapshot = read_snapshot(self.directory, params)
            for bot in snapshot["bots"]:
                try:
                    bot["control"] = self.processes.status(bot["bot_id"])
                    control = bot["control"]
                    if (
                        control["run"]
                        and control["run"]["status"]
                        in ("starting", "preparing", "running", "backoff")
                        and not control["verified_sessions"]
                    ):
                        bot["state"] = "waiting"
                    if bot.get("integration_pending"):
                        bot["state"] = "waiting"
                except (sqlite3.Error, ValueError, OSError) as error:
                    bot["control"] = {
                        "can_start": False,
                        "can_stop": False,
                        "reason": str(error)[:150],
                        "run": None,
                    }
            return snapshot
        if method == "launch_profile":
            return self.processes.profile(str(params["bot_id"]))
        if method == "save_launch_profile":
            return self.processes.save_profile(str(params["bot_id"]), params["profile"])
        if method == "control_bot":
            return self.processes.control(
                str(params["bot_id"]), params["action"], force=params.get("force", False)
            )
        if method == "preview_retention":
            return self.preview(validate_settings(params["settings"]))
        if method == "save_settings":
            settings = validate_settings(params["settings"])
            current = load_settings(self.directory)
            reducing = any(
                settings[key] is not None and (current[key] is None or settings[key] < current[key])
                for key in (
                    "statistics_days",
                    "errors_days",
                    "diagnostics_days",
                    "logs_days",
                    "resources_days",
                )
            )
            if reducing and params.get("confirm_cleanup") is not True:
                raise ValueError("Reducing retention requires confirm_cleanup")
            save_settings(self.directory, settings)
            return {"settings": settings, "deleted": self.cleanup(settings)}
        raise ValueError("Unknown method")


def serve(directory: Path) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stdin.reconfigure(encoding="utf-8")
    bridge = Bridge(directory)
    while True:
        line = sys.stdin.readline(MAX_LINE + 1)
        if not line:
            bridge.close()
            return 0
        request_id = None
        try:
            if len(line) > MAX_LINE:
                raise ValueError("Request too large")
            request = json.loads(line)
            if not isinstance(request, dict):
                raise ValueError("Expected an object")
            request_id = request.get("id")
            params = request.get("params", {})
            if not isinstance(params, dict):
                raise ValueError("Expected object params")
            result = bridge.call(request["method"], params)
            response = {"id": request_id, "result": result}
        except Exception as error:
            from .privacy import redact

            response = {
                "id": request_id,
                "error": {"type": type(error).__name__, "message": redact(str(error))[:500]},
            }
        sys.stdout.write(json.dumps(response, ensure_ascii=False, allow_nan=False) + "\n")
        sys.stdout.flush()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Bot Control stdio bridge (no listening port)")
    parser.add_argument("--stdio", action="store_true", required=True)
    parser.add_argument("--data-dir")
    args = parser.parse_args(argv)
    return serve(data_directory(args.data_dir))


if __name__ == "__main__":
    raise SystemExit(main())
