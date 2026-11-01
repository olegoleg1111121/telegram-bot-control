"""Generate explicitly synthetic, reproducible showcase data. Never uses Telegram."""

import argparse
import math
import random
import time
from pathlib import Path

from telegram_bot_control.store import Store


def generate(directory: Path) -> None:
    if list(directory.glob("bot-*.sqlite3")):
        raise SystemExit("Choose an empty demo directory; existing bot data is never overwritten")
    randomizer = random.Random(42)
    now = time.time()
    names = [
        ("Support Hub", "support_demo_bot", 1.0),
        ("Shop Assistant", "shop_demo_bot", 0.68),
        ("Notify Flow", "notify_demo_bot", 0.34),
    ]
    count = 0
    for bot_index, (name, username, multiplier) in enumerate(names):
        bot_id = str(980000001 + bot_index)
        events = []
        for hour in range(7 * 24):
            ts = now - (7 * 24 - hour) * 3600
            trend = 20 + hour * 0.13 + 24 * max(0, math.sin(hour / 24 * 2 * math.pi))
            for number in range(max(2, int(trend * multiplier + randomizer.randrange(9)))):
                kind = randomizer.choices(["message", "command", "callback"], weights=[52, 32, 16])[
                    0
                ]
                label = (
                    randomizer.choice(["/start", "/help", "/catalog"])
                    if kind == "command"
                    else randomizer.choice(["catalog.open", "order.status", "settings.open"])
                    if kind == "callback"
                    else ""
                )
                error = randomizer.random() < 0.003
                item = {
                    "id": f"demo:{hour}:{number}",
                    "ts": ts + randomizer.randrange(3500),
                    "kind": kind,
                    "label": label,
                    "user_id": randomizer.randrange(1000, 1800 + bot_index * 150),
                    "duration_ms": randomizer.randrange(5, 140),
                    "outcome": "error" if error else "handled",
                }
                if error:
                    item["error"] = {
                        "type": "TimeoutError",
                        "message": "Demo delivery timeout. Retry scheduled.",
                        "traceback": '  File "/srv/bots/demo/handlers.py", line 42, in deliver\nTimeoutError: Demo delivery timeout. Retry scheduled.',
                    }
                events.append(item)
        count += len(events)
        Store(directory, bot_id).write(
            {
                "bot_id": bot_id,
                "name": name,
                "username": username,
                "entrypoint": f"/srv/bots/{username}/main.py",
                "directory": f"/srv/bots/{username}",
                "interpreter": "/usr/bin/python3",
            },
            {
                "id": f"demo-session-{bot_index}",
                "pid": 0,
                "started_at": now - 86400,
                "last_seen": now,
                "stopped_at": now if bot_index == 2 else None,
                "state": "stopped" if bot_index == 2 else "running",
                "dropped": 0,
                "write_failures": 0,
            },
            events,
        )
    print(f"Generated {count} synthetic showcase events for 3 demo bots. No Telegram requests.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", required=True)
    generate(Path(parser.parse_args().data_dir).resolve())
