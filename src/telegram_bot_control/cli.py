"""Command-line launchers for the desktop, stdio bridge and offline aiogram bot."""

import argparse
import asyncio
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from . import __version__
from .config import data_directory


def installed_desktop(root: Path, platform: str, env: dict[str, str]) -> str | None:
    override = env.get("BOTCONTROL_DESKTOP")
    if override:
        path = Path(override).expanduser()
        return str(path) if path.is_file() else shutil.which(override)
    on_path = shutil.which("telegram-bot-control-desktop")
    if on_path:
        return on_path
    candidates = []
    if platform == "win32":
        for key, suffix in (("LOCALAPPDATA", "Programs"), ("ProgramFiles", "")):
            if env.get(key):
                for name in ("Telegram Bot Control", "telegram-bot-control-desktop"):
                    candidates.append(Path(env[key]) / suffix / name / "Telegram Bot Control.exe")
        candidates.extend(
            [
                root / "release/desktop-build/win-unpacked/Telegram Bot Control.exe",
                root / "desktop/release/win-unpacked/Telegram Bot Control.exe",
            ]
        )
    return next((str(path) for path in candidates if path.is_file()), None)


def desktop_help() -> None:
    print(
        "Приложение не найдено / Desktop application not found.\n"
        "Скачайте готовый установщик / Download the ready-made app:\n"
        f"https://github.com/olegoleg1111121/telegram-bot-control/releases/tag/v{__version__}\n"
        "После установки откройте ярлык Telegram Bot Control.\n"
        "Можно открыть панель в браузере / Or use the browser dashboard:\n"
        "  python -m telegram_bot_control web --port 8765\n"
        "Для нестандартного пути укажите BOTCONTROL_DESKTOP / Set BOTCONTROL_DESKTOP for a custom path.",
        file=sys.stderr,
    )


def launch_desktop(directory: Path, *, force_local: bool = False) -> int:
    root = Path(__file__).resolve().parents[2]
    desktop = root / "desktop"
    installed = installed_desktop(root, sys.platform, dict(os.environ))
    if installed:
        command = [installed]
    else:
        binary = (
            desktop
            / "node_modules/electron/dist"
            / ("electron.exe" if os.name == "nt" else "electron")
        )
        if (
            os.environ.get("BOTCONTROL_DESKTOP")
            or not binary.exists()
            or not (desktop / "dist/index.html").exists()
        ):
            desktop_help()
            return 1
        command = [str(binary), str(desktop)]
    env = dict(
        os.environ, BOTCONTROL_PYTHON=sys.executable, BOTCONTROL_HOME=str(directory), PYTHONUTF8="1"
    )
    if force_local:
        env["BOTCONTROL_FORCE_LOCAL"] = "1"
    flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    try:
        subprocess.Popen(
            command,
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=flags,
            start_new_session=os.name != "nt",
        )
    except OSError:
        desktop_help()
        return 1
    print("Telegram Bot Control opened")
    return 0


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(
        prog="tgbots", description="Telegram Bot Control — embedded telemetry, no local server."
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    sub = parser.add_subparsers(dest="command")
    for name, help_text in (
        ("open", "Open the desktop application"),
        ("status", "Read recorded bot status"),
        ("bridge", "Serve JSON lines on stdin/stdout"),
        ("demo", "Run an offline aiogram fixture"),
        ("web", "Open the optional authenticated web dashboard"),
    ):
        child = sub.add_parser(name, help=help_text)
        child.add_argument("--data-dir", help="Shared local directory for this owner's bots")
        if name == "web":
            child.add_argument("--port", type=int, default=8765)
            child.add_argument("--host", choices=("127.0.0.1", "0.0.0.0"), default="127.0.0.1")
        if name == "status":
            child.add_argument("--json", action="store_true")
        if name == "demo":
            child.add_argument(
                "--duration", type=float, default=0, help="Seconds; 0 runs until Ctrl+C"
            )
            child.add_argument("--interval", type=float, default=0.8)
            child.add_argument("--bots", type=int, default=1)
    args = parser.parse_args(argv)
    if args.command is None:
        parser.print_help()
        return 0
    directory = data_directory(args.data_dir)
    if args.command == "web":
        from .web import run

        if not 1 <= args.port <= 65535:
            parser.error("port must be between 1 and 65535")
        return run(directory, args.host, args.port)
    if args.command == "open":
        return launch_desktop(directory, force_local=args.data_dir is not None)
    if args.command == "bridge":
        from .bridge import serve

        return serve(directory)
    if args.command == "status":
        from .store import read_snapshot

        snapshot = read_snapshot(directory, {})
        if args.json:
            print(json.dumps(snapshot, ensure_ascii=False))
        else:
            print(f"Data: {directory}")
            for bot in snapshot["bots"]:
                print(
                    f"{bot['bot_id']:>12}  {bot['state']:<14}  {bot['name']}  events={bot['metrics']['events']} errors={bot['metrics']['errors']}"
                )
            if not snapshot["bots"]:
                print("No connected bots. Try: tgbots demo --data-dir <directory>")
        return 0
    if args.command == "demo":
        if not 1 <= args.bots <= 1000 or args.interval <= 0 or args.duration < 0:
            parser.error("bots: 1–1000, interval > 0, duration >= 0")
        from .testing import run_offline

        async def run() -> None:
            await asyncio.gather(
                *(
                    run_offline(
                        directory,
                        duration=args.duration,
                        interval=args.interval,
                        bot_id=900000001 + index,
                    )
                    for index in range(args.bots)
                )
            )

        try:
            asyncio.run(run())
        except KeyboardInterrupt:
            pass
    return 0
