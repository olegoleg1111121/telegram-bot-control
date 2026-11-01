"""Read callback and explicit action analytics, including legacy mailboxes."""

from __future__ import annotations

import json
import heapq
import itertools
import math
import sqlite3
import time
from pathlib import Path
from typing import Any

from .custom_actions import validate_name


def action_query(connection: sqlite3.Connection) -> str:
    custom = bool(
        connection.execute("SELECT 1 FROM sqlite_master WHERE name='action_events'").fetchone()
    )
    dedupe = (
        (
            "AND NOT EXISTS(SELECT 1 FROM action_events a WHERE a.update_id=e.id "
            "AND a.name=COALESCE(NULLIF(e.label,''),'callback'))"
        )
        if custom
        else ""
    )
    callbacks = (
        "SELECT e.id,e.ts,COALESCE(NULLIF(e.label,''),'callback') name,e.user_key,"
        "CASE WHEN e.outcome='handled' THEN 'success' ELSE e.outcome END outcome,"
        "e.duration_ms,'callback' source,COALESCE(x.type,'') error_type,"
        "COALESCE(x.message,'') error_message,COALESCE(x.traceback,'') traceback "
        "FROM events e LEFT JOIN errors x ON x.event_id=e.id WHERE e.kind='callback' " + dedupe
    )
    return callbacks + (
        " UNION ALL SELECT id,ts,name,user_key,outcome,duration_ms,source,error_type,error_message,traceback FROM action_events"
        if custom
        else ""
    )


def read_actions(directory: Path, params: dict[str, Any]) -> dict[str, Any]:
    from .store import mailbox_files, reader

    now = time.time()
    since, until = float(params.get("since", now - 86400)), float(params.get("until", now + 1))
    if not 0 <= since < until < 1e12:
        raise ValueError("Invalid time range")
    selected_bot = str(params.get("bot_id", ""))
    name = str(params.get("name", ""))
    if name:
        validate_name(name)
    query = str(params.get("query", ""))[:100]
    source, outcome = params.get("source", ""), params.get("outcome", "")
    if source not in ("", "callback", "custom", "function") or outcome not in (
        "",
        "success",
        "error",
        "cancelled",
        "unhandled",
    ):
        raise ValueError("Invalid action filter")
    offset = max(0, min(int(params.get("offset", 0)), 10000))
    requested = params.get("bucket_seconds", 0)
    if type(requested) is not int or requested not in (0, 60, 300, 3600, 86400):
        raise ValueError("Invalid action bucket")
    span = until - since
    base = requested or (
        60
        if span <= 6 * 3600
        else 300
        if span <= 2 * 86400
        else 3600
        if span <= 31 * 86400
        else 86400
    )
    bucket = base * max(1, math.ceil(span / base / 600))
    where = "ts>=? AND ts<? AND (?='' OR source=?) AND (?='' OR outcome=?) AND instr(lower(name),lower(?))>0"
    args = (since, until, source, source, outcome, outcome, query)
    detail_where = where + " AND (?='' OR name=?)"
    detail_args = (*args, name, name)
    summary = dict(count=0, users=0, errors=0, cancelled=0, avg_ms=0.0)
    definitions: dict[str, dict] = {}
    series: dict[int, dict] = {}
    recent, warnings = [], []
    duration_total = 0.0
    for path in mailbox_files(directory):
        bot_id = path.stem[4:]
        if selected_bot and bot_id != selected_bot:
            continue
        connection = None
        try:
            connection = reader(path)
            connection.execute("BEGIN")
            meta = connection.execute("SELECT value FROM meta WHERE key='name'").fetchone()
            bot_name = json.loads(meta[0]) if meta else bot_id
            prefix = "WITH action_rows AS (" + action_query(connection) + ") "
            for row in connection.execute(
                prefix
                + "SELECT name,COUNT(*) count,COUNT(DISTINCT user_key) users,SUM(outcome='error') errors,"
                "SUM(outcome='cancelled') cancelled,SUM(duration_ms) duration_total,MIN(ts) first_seen,MAX(ts) last_seen "
                f"FROM action_rows WHERE {where} GROUP BY name",
                args,
            ):
                item = dict(row)
                target = definitions.setdefault(
                    item["name"],
                    dict(
                        name=item["name"],
                        count=0,
                        users=0,
                        errors=0,
                        cancelled=0,
                        duration_total=0,
                        first_seen=item["first_seen"],
                        last_seen=item["last_seen"],
                    ),
                )
                for key in ("count", "users", "errors", "cancelled", "duration_total"):
                    target[key] += item[key]
                target["first_seen"] = min(target["first_seen"], item["first_seen"])
                target["last_seen"] = max(target["last_seen"], item["last_seen"])
            row = connection.execute(
                prefix
                + "SELECT COUNT(*) count,COUNT(DISTINCT user_key) users,COALESCE(SUM(outcome='error'),0) errors,"
                "COALESCE(SUM(outcome='cancelled'),0) cancelled,COALESCE(SUM(duration_ms),0) duration_total "
                f"FROM action_rows WHERE {detail_where}",
                detail_args,
            ).fetchone()
            for key in ("count", "users", "errors", "cancelled"):
                summary[key] += row[key]
            duration_total += row["duration_total"]
            for row in connection.execute(
                prefix
                + "SELECT CAST(ts/? AS INTEGER)*? ts,COUNT(*) count,SUM(outcome='error') errors "
                f"FROM action_rows WHERE {detail_where} GROUP BY CAST(ts/? AS INTEGER)",
                (bucket, bucket, *detail_args, bucket),
            ):
                target = series.setdefault(row["ts"], dict(ts=row["ts"], count=0, errors=0))
                target["count"] += row["count"]
                target["errors"] += row["errors"]
            rows = connection.execute(
                prefix
                + "SELECT id,ts,name,outcome,duration_ms,source,error_type,error_message,traceback "
                f"FROM action_rows WHERE {detail_where} ORDER BY ts DESC,id ASC LIMIT ?",
                (*detail_args, offset + 50),
            )
            recent = heapq.nsmallest(
                offset + 50,
                itertools.chain(
                    recent, (dict(row) | {"bot_id": bot_id, "bot_name": bot_name} for row in rows)
                ),
                key=lambda row: (-row["ts"], row["bot_id"], row["id"]),
            )
        except (sqlite3.Error, ValueError, OSError) as error:
            warnings.append(f"{path.name}: {type(error).__name__}")
        finally:
            if connection:
                connection.close()
    cursor = int(since // bucket) * bucket
    while cursor < until:
        series.setdefault(cursor, dict(ts=cursor, count=0, errors=0))
        cursor += bucket
    summary["avg_ms"] = round(duration_total / summary["count"], 2) if summary["count"] else 0
    actions = []
    for item in definitions.values():
        item["avg_ms"] = round(item.pop("duration_total") / item["count"], 2)
        actions.append(item)
    actions.sort(key=lambda row: (-row["count"], row["name"]))
    recent.sort(key=lambda row: (-row["ts"], row["bot_id"], row["id"]))
    return {
        "summary": summary,
        "actions": actions,
        "series": sorted(series.values(), key=lambda row: row["ts"]),
        "recent": recent[offset : offset + 50],
        "total": summary["count"],
        "bucket_seconds": bucket,
        "warnings": warnings,
        "fetched_at": now,
    }
