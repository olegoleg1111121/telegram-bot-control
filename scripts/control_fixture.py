"""Prepare an isolated complex bot profile for interactive and Electron tests."""

import argparse
import json
import shutil
import sys
import time
from pathlib import Path

from telegram_bot_control.processes import ProcessManager
from telegram_bot_control.store import Store


def prepare(directory: Path, project: Path):
    if not project.exists():
        shutil.copytree(Path(__file__).parents[1] / "examples/complex_bot", project)
    config = project / "config with spaces.json"
    config.write_text(
        json.dumps(
            {"prepared": str(project / "prepared.flag"), "required_flavor": "desktop workflow"}
        ),
        encoding="utf-8",
    )
    env_file = project / ".env"
    env_file.write_text(
        'BOT_FLAVOR="desktop workflow"\nFIXTURE_SECRET=offline-fixture-only\n', encoding="utf-8"
    )
    bot_id = "940000001"
    store = Store(directory, bot_id)
    if not store.path.exists():
        store.write(
            {
                "bot_id": bot_id,
                "name": "Сложный тестовый бот",
                "username": "complex_fixture",
                "entrypoint": str(project / "main.py"),
                "directory": str(project),
                "interpreter": sys.executable,
            },
            {
                "id": "seed",
                "pid": 0,
                "started_at": time.time() - 60,
                "last_seen": time.time() - 60,
                "stopped_at": time.time() - 60,
                "state": "stopped",
                "dropped": 0,
                "write_failures": 0,
            },
            [],
        )
    profile = {
        "command": [
            sys.executable,
            "-m",
            "complex_aiogram_bot",
            "--bot-id",
            bot_id,
            "--config",
            str(config),
            "--label",
            "Desktop & FSM workflow",
            "--report",
            str(project / "report.jsonl"),
        ],
        "cwd": str(project),
        "pre_start": [[sys.executable, str(project / "prepare.py"), "--config", str(config)]],
        "env_file": str(env_file),
        "environment": {},
        "required_env": ["BOT_FLAVOR", "FIXTURE_SECRET"],
    }
    manager = ProcessManager(directory)
    manager.save_profile(bot_id, profile)
    print(f"Prepared isolated complex aiogram fixture {bot_id}: {directory}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", required=True)
    parser.add_argument("--project-dir", required=True)
    args = parser.parse_args()
    prepare(Path(args.data_dir).resolve(), Path(args.project_dir).resolve())
