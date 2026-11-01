"""Durable per-bot mailboxes. SQLite WAL is the interprocess transport."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import sqlite3
import time
from pathlib import Path
from typing import Any

from .config import ensure_private_directory, load_settings
from .action_stats import action_query

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(
 id TEXT PRIMARY KEY, pid INTEGER NOT NULL, started_at REAL NOT NULL,
 last_seen REAL NOT NULL, stopped_at REAL, state TEXT NOT NULL,
 dropped INTEGER NOT NULL DEFAULT 0, write_failures INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS events(
 id TEXT PRIMARY KEY, ts REAL NOT NULL, kind TEXT NOT NULL,
 label TEXT NOT NULL, user_key TEXT, outcome TEXT NOT NULL,
 duration_ms REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS events_time ON events(ts);
CREATE INDEX IF NOT EXISTS events_user ON events(user_key, ts);
CREATE TABLE IF NOT EXISTS action_events(
 id TEXT PRIMARY KEY, ts REAL NOT NULL, name TEXT NOT NULL, user_key TEXT,
 outcome TEXT NOT NULL, duration_ms REAL NOT NULL, source TEXT NOT NULL,
 update_id TEXT NOT NULL, error_type TEXT NOT NULL, error_message TEXT NOT NULL,
 traceback TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS actions_time ON action_events(ts);
CREATE INDEX IF NOT EXISTS actions_name ON action_events(name,ts);
CREATE INDEX IF NOT EXISTS actions_origin ON action_events(update_id,name);
CREATE TABLE IF NOT EXISTS errors(
 event_id TEXT PRIMARY KEY, ts REAL NOT NULL, fingerprint TEXT NOT NULL,
 kind TEXT NOT NULL, type TEXT NOT NULL, message TEXT NOT NULL, traceback TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS errors_time ON errors(ts);
CREATE TABLE IF NOT EXISTS logs(
 id TEXT PRIMARY KEY, ts REAL NOT NULL, level INTEGER NOT NULL, logger TEXT NOT NULL,
 message TEXT NOT NULL, traceback TEXT NOT NULL, source TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS logs_time ON logs(ts);
CREATE TABLE IF NOT EXISTS resources(
 id TEXT PRIMARY KEY, ts REAL NOT NULL, session_id TEXT NOT NULL, pid INTEGER NOT NULL,
 cpu_percent REAL, rss_bytes INTEGER NOT NULL, threads INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS resources_time ON resources(ts);
CREATE TABLE IF NOT EXISTS diagnostics(ts REAL NOT NULL, message TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS process_identity(
 session_id TEXT PRIMARY KEY, created REAL NOT NULL, executable TEXT NOT NULL,
 launch_hint TEXT NOT NULL, launch_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS control_requests(
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL, action TEXT NOT NULL,
 created REAL NOT NULL, expires REAL NOT NULL, status TEXT NOT NULL, error TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS control_pending ON control_requests(session_id,status);
PRAGMA user_version = 2;
"""


def mailbox_path(directory: Path, bot_id: str | int) -> Path:
    value = str(bot_id)
    if not value.isascii() or not value.isdigit() or len(value) > 20:
        raise ValueError("bot_id must be a numeric Telegram ID")
    return directory / f"bot-{value}.sqlite3"


def mailbox_files(directory: Path) -> list[Path]:
    # Path.glob silently hides PermissionError on some Python versions. A denied
    # data directory must be reported as a connection failure, not an empty fleet.
    try:
        entries = os.scandir(directory)
    except FileNotFoundError:
        return []
    with entries:
        paths = [
            directory / entry.name
            for entry in entries
            if entry.name.startswith("bot-")
            and entry.name.endswith(".sqlite3")
            and entry.is_file(follow_symlinks=False)
        ]
    return sorted(paths)


def reader(path: Path) -> sqlite3.Connection:
    for attempt in range(3):
        connection = sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True, timeout=0.3)
        try:
            connection.row_factory = sqlite3.Row
            connection.execute("PRAGMA query_only=ON")
            if connection.execute("PRAGMA user_version").fetchone()[0] > 2:
                raise ValueError("Unsupported database schema")
            return connection
        except sqlite3.OperationalError as error:
            connection.close()
            if attempt == 2 or getattr(error, "sqlite_errorcode", 0) & 0xFF not in (
                sqlite3.SQLITE_BUSY,
                sqlite3.SQLITE_LOCKED,
            ):
                raise
            time.sleep(0.05 * (attempt + 1))
        except Exception:
            connection.close()
            raise


class Store:
    def __init__(self, directory: Path, bot_id: str | int):
        self.directory = directory
        self.path = mailbox_path(directory, bot_id)
        self._last_cleanup = 0.0

    def write(
        self, metadata: dict[str, Any], session: dict[str, Any], events: list[dict[str, Any]]
    ) -> None:
        ensure_private_directory(self.directory)
        connection = sqlite3.connect(self.path, timeout=0.3)
        try:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute("PRAGMA synchronous=NORMAL")
            if connection.execute("PRAGMA user_version").fetchone()[0] > 2:
                raise ValueError("Unsupported database schema")
            connection.executescript(SCHEMA)
            with connection:
                connection.execute(
                    "INSERT OR IGNORE INTO meta VALUES ('user_secret', ?)", (os.urandom(32).hex(),)
                )
                secret = bytes.fromhex(
                    connection.execute("SELECT value FROM meta WHERE key='user_secret'").fetchone()[
                        0
                    ]
                )
                # Metadata of the latest session wins, even if an old session reconnects.
                latest = connection.execute("SELECT MAX(started_at) FROM sessions").fetchone()[0]
                if latest is None or session["started_at"] >= latest:
                    for key, value in metadata.items():
                        connection.execute(
                            "INSERT OR REPLACE INTO meta VALUES (?, ?)",
                            (key, json.dumps(value, ensure_ascii=False)),
                        )
                previous = connection.execute(
                    "SELECT dropped, write_failures FROM sessions WHERE id=?", (session["id"],)
                ).fetchone()
                before_drops, before_failures = previous if previous else (0, 0)
                if session["dropped"] > before_drops or session["write_failures"] > before_failures:
                    connection.execute(
                        "INSERT INTO diagnostics VALUES (?, ?)",
                        (
                            time.time(),
                            f"dropped={session['dropped']}; write_failures={session['write_failures']}",
                        ),
                    )
                connection.execute(
                    "INSERT INTO sessions VALUES (:id, :pid, :started_at, :last_seen, :stopped_at, :state, :dropped, :write_failures) "
                    "ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen, stopped_at=excluded.stopped_at, "
                    "state=excluded.state, dropped=excluded.dropped, write_failures=excluded.write_failures",
                    session,
                )
                if session.get("process_identity"):
                    identity = session["process_identity"]
                    connection.execute(
                        "INSERT OR REPLACE INTO process_identity VALUES (?,?,?,?,?)",
                        (
                            session["id"],
                            identity["created"],
                            identity["executable"],
                            json.dumps(identity["launch_hint"], ensure_ascii=False),
                            identity["launch_id"],
                        ),
                    )
                for event in events:
                    if event["kind"] == "log":
                        connection.execute(
                            "INSERT OR IGNORE INTO logs VALUES (?,?,?,?,?,?,?)",
                            (
                                event["id"],
                                event["ts"],
                                event["level"],
                                event["logger"],
                                event["message"],
                                event.get("traceback", ""),
                                event["source"],
                            ),
                        )
                        continue
                    if event["kind"] == "resource":
                        connection.execute(
                            "INSERT OR IGNORE INTO resources VALUES (?,?,?,?,?,?,?)",
                            (
                                event["id"],
                                event["ts"],
                                event["session_id"],
                                event["pid"],
                                event["cpu_percent"],
                                event["rss_bytes"],
                                event["threads"],
                            ),
                        )
                        continue
                    user = event.get("user_id")
                    user_key = (
                        hmac.new(secret, str(user).encode(), hashlib.sha256).hexdigest()
                        if user is not None
                        else None
                    )
                    if event["kind"] == "action":
                        error = event.get("error") or {}
                        connection.execute(
                            "INSERT OR IGNORE INTO action_events VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                            (
                                hmac.new(secret, event["id"].encode(), hashlib.sha256).hexdigest(),
                                event["ts"],
                                event["label"],
                                user_key,
                                event["outcome"],
                                event["duration_ms"],
                                event["source"],
                                event.get("update_id", ""),
                                error.get("type", ""),
                                error.get("message", ""),
                                error.get("traceback", ""),
                            ),
                        )
                        continue
                    cursor = connection.execute(
                        "INSERT OR IGNORE INTO events VALUES (?, ?, ?, ?, ?, ?, ?)",
                        (
                            event["id"],
                            event["ts"],
                            event["kind"],
                            event.get("label", ""),
                            user_key,
                            event["outcome"],
                            max(0, event["duration_ms"]),
                        ),
                    )
                    error = event.get("error")
                    if cursor.rowcount and error:
                        fingerprint = hashlib.sha256(
                            (error["type"] + error["traceback"]).encode()
                        ).hexdigest()[:24]
                        connection.execute(
                            "INSERT OR IGNORE INTO errors VALUES (?, ?, ?, ?, ?, ?, ?)",
                            (
                                event["id"],
                                event["ts"],
                                fingerprint,
                                event["kind"],
                                error["type"],
                                error["message"],
                                error["traceback"],
                            ),
                        )
            with connection:
                for table, cap in (("logs", 20000), ("resources", 150000)):
                    connection.execute(
                        f"DELETE FROM {table} WHERE rowid<=(SELECT MAX(rowid)-? FROM {table})",
                        (cap,),
                    )
            if time.monotonic() - self._last_cleanup > 60:
                cleanup_connection(connection, load_settings(self.directory))
                self._last_cleanup = time.monotonic()
        finally:
            connection.close()
        if os.name != "nt":
            self.path.chmod(0o600)


def cleanup_connection(
    connection: sqlite3.Connection, settings: dict[str, Any], now: float | None = None
) -> dict[str, int]:
    current = time.time() if now is None else now
    counts: dict[str, int] = {}
    with connection:
        for table, key in (
            ("events", "statistics_days"),
            ("action_events", "statistics_days"),
            ("errors", "errors_days"),
            ("diagnostics", "diagnostics_days"),
            ("logs", "logs_days"),
            ("resources", "resources_days"),
        ):
            if not table_exists(connection, table):
                counts[table] = 0
                continue
            days = settings.get(key, 7)
            counts[table] = (
                0
                if days is None
                else connection.execute(
                    f"DELETE FROM {table} WHERE ts < ?", (current - days * 86400,)
                ).rowcount
            )
        # A noisy logger must not grow the mailbox indefinitely, even with unlimited retention.
        for table, cap in (("logs", 20000), ("resources", 150000)):
            if table_exists(connection, table):
                connection.execute(
                    f"DELETE FROM {table} WHERE rowid IN (SELECT rowid FROM {table} ORDER BY ts DESC LIMIT -1 OFFSET ?)",
                    (cap,),
                )
        if connection.execute(
            "SELECT 1 FROM sqlite_master WHERE name='control_requests'"
        ).fetchone():
            connection.execute("DELETE FROM control_requests WHERE expires<?", (current - 86400,))
    return counts


def table_exists(connection: sqlite3.Connection, name: str) -> bool:
    return bool(
        connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
        ).fetchone()
    )


def read_logs(directory: Path, params: dict[str, Any]) -> dict[str, Any]:
    bot_id = str(params["bot_id"])
    path = mailbox_path(directory, bot_id)
    since, until = float(params.get("since", 0)), float(params.get("until", time.time() + 1))
    if not 0 <= since < until < 1e12:
        raise ValueError("Invalid time range")
    level = int(params.get("level", 0))
    query = str(params.get("query", ""))[:200]
    offset = max(0, min(int(params.get("offset", 0)), 1000000))
    connection = reader(path)
    try:
        if not table_exists(connection, "logs"):
            return {"items": [], "total": 0}
        where = "ts>=? AND ts<? AND level>=? AND (instr(lower(message),lower(?))>0 OR instr(lower(logger),lower(?))>0)"
        args = (since, until, level, query, query)
        total = connection.execute(f"SELECT COUNT(*) FROM logs WHERE {where}", args).fetchone()[0]
        items = [
            dict(row)
            for row in connection.execute(
                f"SELECT * FROM logs WHERE {where} ORDER BY ts DESC, rowid DESC LIMIT 100 OFFSET ?",
                (*args, offset),
            )
        ]
        return {"items": items, "total": total}
    finally:
        connection.close()


def resource_history(connection: sqlite3.Connection, since: float, until: float) -> dict[str, Any]:
    if not table_exists(connection, "resources"):
        return {"latest": None, "series": []}
    latest = connection.execute("SELECT * FROM resources ORDER BY ts DESC LIMIT 1").fetchone()
    # Per-session buckets avoid joining lines across process restarts.
    bucket = max(5, int((until - since) / 240))
    rows = [
        dict(row)
        for row in connection.execute(
            "SELECT MIN(ts) ts, session_id, pid, AVG(cpu_percent) cpu_percent, AVG(rss_bytes) rss_bytes, "
            "MAX(threads) threads FROM resources WHERE ts>=? AND ts<? "
            "GROUP BY session_id,CAST(ts/? AS INTEGER) ORDER BY ts DESC LIMIT 480",
            (since, until, bucket),
        )
    ]
    return {
        "latest": dict(latest) if latest else None,
        "series": list(reversed(rows)),
        "gap_seconds": bucket * 3,
    }


def session_state(sessions: list[dict[str, Any]], timeout: int, now: float) -> str:
    if not sessions:
        return "waiting"
    if any(s["state"] == "running" and now - s["last_seen"] <= timeout for s in sessions):
        return "running"
    if any(s["state"] != "stopped" for s in sessions):
        return "disconnected"
    return "stopped"


def metrics(connection: sqlite3.Connection, since: float, until: float) -> dict[str, Any]:
    row = dict(
        connection.execute(
            "SELECT COUNT(*) events, COUNT(DISTINCT user_key) users, "
            "COALESCE(SUM(kind='message'),0) messages, COALESCE(SUM(kind='callback'),0) callbacks, "
            "COALESCE(SUM(kind='command'),0) commands, COALESCE(SUM(outcome='error'),0) errors, "
            "COALESCE(AVG(duration_ms),0) avg_ms FROM events WHERE ts>=? AND ts<?",
            (since, until),
        ).fetchone()
    )
    # Commands are Telegram messages too.
    row["messages"] += row["commands"]
    row["avg_ms"] = round(row["avg_ms"], 2)
    row["known_users"] = connection.execute(
        "SELECT COUNT(DISTINCT user_key) FROM events"
    ).fetchone()[0]
    return row


def read_snapshot(directory: Path, params: dict[str, Any]) -> dict[str, Any]:
    import platform
    import socket

    now = time.time()
    since = float(params.get("since", now - 7 * 86400))
    until = float(params.get("until", now + 1))
    if not (0 <= since < until < 1e12):
        raise ValueError("Invalid time range")
    selected = str(params.get("bot_id", ""))
    resource_since = float(params.get("resource_since", max(0, now - 3600)))
    if not 0 <= resource_since < now + 1:
        raise ValueError("Invalid resource time range")
    offset = max(0, min(int(params.get("error_offset", 0)), 1000000))
    limit = max(1, min(int(params.get("error_limit", 30)), 100))
    query = str(params.get("error_query", ""))[:200]
    settings = load_settings(directory)
    bots, errors, warnings = [], [], []
    series: dict[int, dict[str, Any]] = {}
    commands: dict[str, int] = {}
    actions: dict[str, int] = {}
    total = dict(
        events=0, users=0, messages=0, callbacks=0, commands=0, errors=0, avg_ms=0.0, known_users=0
    )
    weighted_duration = 0.0
    history_start = None
    error_groups = 0
    db_bytes = 0
    bucket = 3600 if until - since <= 7 * 86400 + 60 else 86400
    for path in mailbox_files(directory):
        connection = None
        try:
            db_bytes += sum(
                p.stat().st_size for p in (path, Path(str(path) + "-wal")) if p.exists()
            )
            connection = reader(path)
            connection.execute("BEGIN")
            metadata = {
                row["key"]: json.loads(row["value"])
                for row in connection.execute("SELECT * FROM meta WHERE key!='user_secret'")
            }
            sessions = [
                dict(row)
                for row in connection.execute(
                    "SELECT * FROM sessions ORDER BY started_at DESC LIMIT 100"
                )
            ]
            values = metrics(connection, since, until)
            bot_id = str(metadata["bot_id"])
            first = connection.execute("SELECT MIN(ts) FROM events").fetchone()[0]
            if first is not None:
                history_start = first if history_start is None else min(history_start, first)
            dropped = sum(s["dropped"] for s in sessions)
            failures = sum(s["write_failures"] for s in sessions)
            bots.append(
                metadata
                | {
                    "bot_id": bot_id,
                    "state": session_state(sessions, settings["connection_timeout_seconds"], now),
                    "last_seen": max((s["last_seen"] for s in sessions), default=0),
                    "sessions": sessions,
                    "metrics": values,
                    "dropped": dropped,
                    "write_failures": failures,
                    "resources": resource_history(connection, resource_since, now + 1)
                    if selected == bot_id
                    else None,
                }
            )
            if selected and selected != bot_id:
                continue
            for key in total:
                if key != "avg_ms":
                    total[key] += values[key]
            weighted_duration += values["avg_ms"] * values["events"]
            for row in connection.execute(
                "SELECT CAST(ts/? AS INTEGER)*? bucket, COUNT(*) count, SUM(outcome='error') errors "
                "FROM events WHERE ts>=? AND ts<? GROUP BY bucket",
                (bucket, bucket, since, until),
            ):
                item = series.setdefault(
                    row["bucket"], {"ts": row["bucket"], "count": 0, "errors": 0}
                )
                item["count"] += row["count"]
                item["errors"] += row["errors"]
            for kind, target in (("command", commands),):
                for row in connection.execute(
                    "SELECT label, COUNT(*) count FROM events WHERE ts>=? AND ts<? AND kind=? GROUP BY label",
                    (since, until, kind),
                ):
                    target[row["label"]] = target.get(row["label"], 0) + row["count"]
            for row in connection.execute(
                "WITH action_rows AS ("
                + action_query(connection)
                + ") SELECT name,COUNT(*) count FROM action_rows WHERE ts>=? AND ts<? GROUP BY name",
                (since, until),
            ):
                actions[row["name"]] = actions.get(row["name"], 0) + row["count"]
            error_filter = "ts>=? AND ts<? AND (message LIKE ? OR type LIKE ?)"
            error_args = (since, until, f"%{query}%", f"%{query}%")
            error_groups += connection.execute(
                f"SELECT COUNT(DISTINCT fingerprint) FROM errors WHERE {error_filter}", error_args
            ).fetchone()[0]
            for row in connection.execute(
                f"SELECT fingerprint, type, message, traceback, kind, COUNT(*) count, MIN(ts) first_seen, MAX(ts) last_seen "
                f"FROM errors WHERE {error_filter} GROUP BY fingerprint ORDER BY last_seen DESC LIMIT ?",
                (*error_args, offset + limit),
            ):
                errors.append(
                    dict(row) | {"bot_id": bot_id, "bot_name": metadata.get("name", bot_id)}
                )
        except (sqlite3.Error, ValueError, KeyError, OSError) as error:
            warnings.append(f"{path.name}: {type(error).__name__}")
        finally:
            if connection:
                connection.close()
    total["avg_ms"] = round(weighted_duration / total["events"], 2) if total["events"] else 0
    errors.sort(key=lambda row: row["last_seen"], reverse=True)
    # Fill missing buckets: zero activity must not be drawn as a continuous plateau.
    slots = min(400, int((until - since) / bucket) + 2)
    step = bucket if slots < 400 else max(bucket, int((until - since) / 399 / bucket + 1) * bucket)
    chart: dict[int, dict[str, Any]] = {}
    cursor = int(since // step) * step
    while cursor < until and len(chart) < 401:
        chart[cursor] = {"ts": cursor, "count": 0, "errors": 0}
        cursor += step
    for point in series.values():
        item = chart.setdefault(
            int(point["ts"] // step) * step,
            {"ts": int(point["ts"] // step) * step, "count": 0, "errors": 0},
        )
        item["count"] += point["count"]
        item["errors"] += point["errors"]
    return {
        "meta": {
            "hostname": socket.gethostname(),
            "platform": platform.system(),
            "transport": "stdio",
            "data_dir": str(directory),
            "db_bytes": db_bytes,
            "history_start": history_start,
            "warnings": warnings,
            "fetched_at": now,
        },
        "bots": bots,
        "totals": total,
        "series": sorted(chart.values(), key=lambda p: p["ts"]),
        "commands": sorted(
            ({"label": k, "count": v} for k, v in commands.items()),
            key=lambda r: r["count"],
            reverse=True,
        )[:30],
        "actions": sorted(
            ({"label": k or "callback", "count": v} for k, v in actions.items()),
            key=lambda r: r["count"],
            reverse=True,
        )[:30],
        "errors": errors[offset : offset + limit],
        "error_groups": error_groups,
        "settings": settings,
    }
