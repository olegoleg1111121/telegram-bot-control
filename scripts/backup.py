"""Consistent SQLite snapshots, including live WAL data. No bot downtime needed."""

import argparse
import shutil
import sqlite3
from pathlib import Path

from telegram_bot_control.config import data_directory, ensure_private_directory
from telegram_bot_control.store import mailbox_files, reader


def backup(source: Path, target: Path) -> int:
    ensure_private_directory(target)
    count = 0
    files = mailbox_files(source)
    if (source / "process-control.sqlite3").exists():
        files.append(source / "process-control.sqlite3")
    for path in files:
        destination = target / path.name
        if destination.exists():
            raise FileExistsError(f"Backup already exists: {destination}")
        original = reader(path)
        copy = sqlite3.connect(destination)
        try:
            original.backup(copy, pages=256, sleep=0.01)
            count += 1
        finally:
            copy.close()
            original.close()
    settings = source / "settings.json"
    if settings.exists():
        destination = target / settings.name
        if destination.exists():
            raise FileExistsError(f"Backup already exists: {destination}")
        shutil.copy2(settings, destination)
    print(f"Saved {count} consistent database snapshots to {target}")
    return count


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    backup(data_directory(args.data_dir), Path(args.output).resolve())
