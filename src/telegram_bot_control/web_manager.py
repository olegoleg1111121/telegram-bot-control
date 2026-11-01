"""Own a web-panel child for the lifetime of a desktop stdio connection."""

from __future__ import annotations

import json
import queue
import subprocess
import sys
import threading
from pathlib import Path


class WebManager:
    def __init__(self, directory: Path):
        self.directory = directory
        self.process: subprocess.Popen | None = None
        self.info: dict = {"running": False}

    def status(self) -> dict:
        if self.process and self.process.poll() is None:
            return dict(self.info)
        self.info = {"running": False}
        return dict(self.info)

    def start(self, host: str, port: int) -> dict:
        if self.status()["running"]:
            raise ValueError("web_already_running")
        if host not in ("127.0.0.1", "0.0.0.0") or type(port) is not int or not 1 <= port <= 65535:
            raise ValueError("invalid_web_port_or_host")
        process = subprocess.Popen(
            [
                sys.executable,
                "-u",
                "-m",
                "telegram_bot_control.web",
                "--child",
                "--data-dir",
                str(self.directory),
                "--host",
                host,
                "--port",
                str(port),
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            encoding="utf-8",
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        self.process = process
        lines: queue.Queue[str] = queue.Queue()
        threading.Thread(
            target=lambda: lines.put(process.stdout.readline(65536)), daemon=True
        ).start()
        try:
            line = lines.get(timeout=10)
            self.info = json.loads(line)
            if self.info.get("running") is not True:
                raise ValueError("web_start_failed")
            return self.status()
        except (queue.Empty, ValueError):
            self.stop()
            raise ValueError("web_start_failed_check_port_and_assets") from None

    def stop(self) -> dict:
        process = self.process
        if process:
            if process.stdin:
                process.stdin.close()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.terminate()
                process.wait(timeout=3)
            if process.stdout:
                process.stdout.close()
        self.process = None
        self.info = {"running": False}
        return dict(self.info)
