"""Detached launcher with an opt-in, bounded on-failure restart policy. No port."""

import argparse
import json
import os
import re
import subprocess
import time
from pathlib import Path

import psutil

from .privacy import redact
from .launch_output import LaunchOutput
from .processes import ProcessManager, environment_for, expand_command, validate_profile


def run(directory: Path, bot_id: str, launch_id: str) -> int:
    manager = ProcessManager(directory)
    connection = manager.database()
    env = {}
    children: dict[int, psutil.Process] = {}
    output: LaunchOutput | None = None

    def update(**values):
        with connection:
            connection.execute(
                "UPDATE runs SET " + ",".join(f"{key}=?" for key in values) + " WHERE id=?",
                (*values.values(), launch_id),
            )

    def details(**values):
        with connection:
            connection.execute(
                "UPDATE run_state SET " + ",".join(f"{key}=?" for key in values) + " WHERE id=?",
                (*values.values(), launch_id),
            )

    def cancelled():
        row = connection.execute(
            "SELECT stop_requested FROM runs WHERE id=?", (launch_id,)
        ).fetchone()
        return not row or row[0] == 1

    def remember(child):
        try:
            root = psutil.Process(child.pid)
            children[root.pid] = root
            children.update({p.pid: p for p in root.children(recursive=True)})
        except psutil.NoSuchProcess:
            pass

    def cleanup_children():
        # Commands stay in the foreground; descendants must not survive a retry.
        for process in reversed(list(children.values())):
            try:
                process.kill()  # psutil verifies PID birth before signalling.
            except psutil.NoSuchProcess:
                pass
        psutil.wait_procs(list(children.values()), timeout=3)
        children.clear()

    def launch(parts, phase):
        nonlocal output
        child = subprocess.Popen(
            expand_command(parts, env),
            cwd=profile["cwd"],
            env=env,
            shell=False,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        output = LaunchOutput(child, secrets, phase)
        remember(child)
        details(
            child_pid=child.pid,
            child_born=children[child.pid].create_time() if child.pid in children else None,
        )
        return child

    try:
        row = connection.execute(
            "SELECT * FROM runs WHERE id=? AND bot_id=?", (launch_id, bot_id)
        ).fetchone()
        if not row:
            return 1
        profile = validate_profile(json.loads(row["spec"]))
        policy = profile["restart"]
        env = environment_for(profile)
        env.update(
            BOTCONTROL_HOME=str(directory),
            BOTCONTROL_LAUNCH_ID=launch_id,
            PYTHONUTF8="1",
            PYTHONIOENCODING="utf-8",
            PYTHONUNBUFFERED="1",
        )
        secrets = [
            value
            for key, value in env.items()
            if re.search(r"(?i)token|secret|password|key|credential", key)
        ]
        with connection:
            connection.execute("INSERT OR IGNORE INTO run_state(id) VALUES (?)", (launch_id,))
        update(pid=os.getpid(), born=psutil.Process().create_time(), status="preparing")
        consecutive = total = 0
        while True:
            if cancelled():
                update(status="stopped", error="")
                return 0
            if total and manager.active_sessions(bot_id):
                update(status="failed", error="already_running")
                return 1
            update(status="preparing", error="")
            result, reason = 0, ""
            for index, step in enumerate(profile["pre_start"]):
                if cancelled():
                    break
                child = launch(step, f"attempt {total + 1} / prepare {index + 1}")
                deadline = time.monotonic() + 30
                while child.poll() is None:
                    output.drain(connection, launch_id)
                    remember(child)
                    if cancelled() or time.monotonic() >= deadline:
                        cleanup_children()
                        child.wait(timeout=3)
                        reason = "" if cancelled() else f"prepare_timeout:{index + 1}"
                        result = 0 if cancelled() else 1
                        break
                    time.sleep(0.1)
                if not reason and child.returncode:
                    result, reason = child.returncode, f"prepare_failed:{index + 1}"
                cleanup_children()
                output.finish(connection, launch_id)
                if reason:
                    break
            started = time.monotonic()
            if not reason and not cancelled():
                child = launch(profile["command"], f"attempt {total + 1} / bot")
                update(status="stopping" if cancelled() else "running")
                while child.poll() is None:
                    output.drain(connection, launch_id)
                    remember(child)
                    time.sleep(0.2)
                result = child.returncode
                reason = "command_exited" if result else ""
                cleanup_children()
                output.finish(connection, launch_id)
            details(child_pid=None, child_born=None, next_retry_at=None)
            if cancelled() or result == 0:
                update(status="stopped", exit_code=result, error="")
                return 0
            if time.monotonic() - started >= policy["reset_after_seconds"]:
                consecutive = 0
            if not policy["enabled"] or consecutive >= policy["max_restarts"]:
                update(
                    status="failed",
                    exit_code=result,
                    error="restart_limit_reached" if policy["enabled"] else reason,
                )
                return 1
            delay = min(policy["max_delay_seconds"], policy["delay_seconds"] * 2**consecutive)
            consecutive += 1
            total += 1
            details(restarts=total, next_retry_at=time.time() + delay)
            update(status="backoff", exit_code=result, error=reason)
            deadline = time.monotonic() + delay
            while time.monotonic() < deadline:
                if cancelled():
                    details(next_retry_at=None)
                    update(status="stopped", error="")
                    return 0
                time.sleep(min(0.1, max(0, deadline - time.monotonic())))
    except Exception as error:
        secrets = [
            value for key, value in env.items() if re.search(r"(?i)token|secret|password|key", key)
        ]
        update(status="failed", error=redact(str(error), secrets)[:200])
        return 1
    finally:
        cleanup_children()
        if output:
            output.finish(connection, launch_id)
        connection.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", required=True)
    parser.add_argument("--bot-id", required=True)
    parser.add_argument("--launch-id", required=True)
    args = parser.parse_args()
    raise SystemExit(run(Path(args.data_dir).resolve(), args.bot_id, args.launch_id))
