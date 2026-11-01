"""Reproducible offline aiogram workload. Does not create Telegram accounts."""

import argparse
import asyncio
import json
import sys
import time
import tracemalloc
from pathlib import Path

from telegram_bot_control.store import read_snapshot
from telegram_bot_control.testing import create_offline_bot, make_update


async def run(directory: Path, bots: int, seconds: int) -> dict:
    directory.mkdir(parents=True, exist_ok=True)
    if list(directory.glob("bot-*.sqlite3")):
        raise SystemExit("Use a fresh benchmark directory to avoid mixing runs")
    fixtures = [create_offline_bot(directory, bot_id=910000000 + i) for i in range(bots)]
    tracemalloc.start()
    startup = time.perf_counter()
    await asyncio.gather(*(dp.emit_startup(bot=bot) for bot, dp, _ in fixtures))
    await asyncio.gather(*(monitor.flush(timeout=30) for _, _, monitor in fixtures))
    startup_ms = (time.perf_counter() - startup) * 1000
    started = time.perf_counter()
    cpu = time.process_time()
    update_id = time.time_ns() // 1000
    expected = 0
    for tick in range(seconds):
        await asyncio.gather(
            *(
                dp.feed_update(
                    bot, make_update(update_id + tick, text="/start", user_id=101 + tick % 10)
                )
                for bot, dp, _ in fixtures
            )
        )
        expected += bots
        await asyncio.sleep(max(0, started + tick + 1 - time.perf_counter()))
    await asyncio.gather(*(monitor.flush(timeout=30) for _, _, monitor in fixtures))
    elapsed = time.perf_counter() - started
    cpu_seconds = time.process_time() - cpu
    before = time.perf_counter()
    snapshot = await asyncio.to_thread(read_snapshot, directory, {})
    snapshot_ms = (time.perf_counter() - before) * 1000
    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    await asyncio.gather(*(dp.emit_shutdown(bot=bot) for bot, dp, _ in fixtures))
    result = {
        "bots": bots,
        "duration_seconds": round(elapsed, 3),
        "target_events_per_second": bots,
        "events_sent": expected,
        "events_recorded": snapshot["totals"]["events"],
        "events_lost": expected - snapshot["totals"]["events"],
        "queue_drops": sum(m.dropped for _, _, m in fixtures),
        "write_failures": sum(m.write_failures for _, _, m in fixtures),
        "python_peak_mb": round(peak / 1048576, 2),
        "cpu_seconds": round(cpu_seconds, 3),
        "snapshot_100_bots_ms": round(snapshot_ms, 2),
        "startup_ms": round(startup_ms, 2),
        "platform": sys.platform,
        "python": sys.version.split()[0],
    }
    print(json.dumps(result, indent=2))
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", required=True)
    parser.add_argument("--bots", type=int, default=100)
    parser.add_argument("--seconds", type=int, default=10)
    parser.add_argument("--output", default="benchmark-results.json")
    args = parser.parse_args()
    if not 1 <= args.bots <= 1000 or not 1 <= args.seconds <= 300:
        parser.error("bots 1–1000, seconds 1–300")
    result = asyncio.run(run(Path(args.data_dir).resolve(), args.bots, args.seconds))
    Path(args.output).write_text(json.dumps(result, indent=2), encoding="utf-8")
    if result["events_lost"] or result["queue_drops"]:
        raise SystemExit(1)
