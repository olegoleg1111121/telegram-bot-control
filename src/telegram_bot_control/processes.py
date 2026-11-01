"""Owner-scoped process control over existing files and stdio; no daemon."""

from __future__ import annotations

import contextlib
import json
import os
import re
import sqlite3
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Any

import psutil

from .config import ensure_private_directory
from .privacy import TOKEN
from .store import mailbox_files, mailbox_path, reader

ACTIVE = ("starting", "preparing", "running", "backoff", "stopping")
RESTART_DEFAULTS = {
    "enabled": False,
    "max_restarts": 5,
    "delay_seconds": 2,
    "max_delay_seconds": 60,
    "reset_after_seconds": 300,
}
ENV_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
REFERENCE = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}")
SENSITIVE = re.compile(r"(?i)(token|password|secret|api[_-]?key|credential)")
CONTROL_SCHEMA = """
CREATE TABLE IF NOT EXISTS profiles(bot_id TEXT PRIMARY KEY, spec TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS runs(
 id TEXT PRIMARY KEY, bot_id TEXT NOT NULL, created REAL NOT NULL,
 status TEXT NOT NULL, pid INTEGER, born REAL, exit_code INTEGER,
 error TEXT NOT NULL DEFAULT '', stop_requested INTEGER NOT NULL DEFAULT 0,
 spec TEXT NOT NULL DEFAULT '{}'
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_run ON runs(bot_id)
 WHERE status IN ('starting','preparing','running','backoff','stopping');
CREATE TABLE IF NOT EXISTS locks(bot_id TEXT PRIMARY KEY, owner TEXT NOT NULL, expires REAL NOT NULL);
CREATE TABLE IF NOT EXISTS run_state(
 id TEXT PRIMARY KEY, restarts INTEGER NOT NULL DEFAULT 0, next_retry_at REAL,
 child_pid INTEGER, child_born REAL
);
CREATE TABLE IF NOT EXISTS run_output(id TEXT PRIMARY KEY, output TEXT NOT NULL);
"""


class ControlError(ValueError):
    pass


def validate_profile(value: Any) -> dict[str, Any]:
    allowed = {"command", "cwd", "pre_start", "env_file", "environment", "required_env", "restart"}
    if not isinstance(value, dict) or set(value) - allowed:
        raise ControlError("invalid_profile")

    def command(parts: Any) -> list[str]:
        if not isinstance(parts, list) or not 1 <= len(parts) <= 128:
            raise ControlError("command_must_be_argument_array")
        for index, part in enumerate(parts):
            if not isinstance(part, str) or not part or "\0" in part or len(part) > 8192:
                raise ControlError("invalid_argument")
            if TOKEN.search(part):
                raise ControlError("secret_in_command_use_environment")
            if index and SENSITIVE.search(parts[index - 1]) and parts[index - 1].startswith("-"):
                if not REFERENCE.fullmatch(part):
                    raise ControlError("secret_in_command_use_environment")
            if "=" in part and part.startswith("-") and SENSITIVE.search(part.split("=", 1)[0]):
                if not REFERENCE.fullmatch(part.split("=", 1)[1]):
                    raise ControlError("secret_in_command_use_environment")
        return parts

    cwd = value.get("cwd")
    if not isinstance(cwd, str) or not Path(cwd).is_absolute() or not Path(cwd).is_dir():
        raise ControlError("working_directory_not_found")
    pre = value.get("pre_start", [])
    if not isinstance(pre, list) or len(pre) > 20:
        raise ControlError("invalid_pre_start")
    environment = value.get("environment", {})
    required = value.get("required_env", [])
    if not isinstance(environment, dict) or not isinstance(required, list):
        raise ControlError("invalid_environment")
    for key, item in environment.items():
        if not ENV_NAME.fullmatch(key) or not isinstance(item, str) or "\0" in item:
            raise ControlError("invalid_environment")
        if TOKEN.search(item) or (SENSITIVE.search(key) and item and not REFERENCE.fullmatch(item)):
            raise ControlError("secret_in_profile_use_env_file")
    if any(not isinstance(key, str) or not ENV_NAME.fullmatch(key) for key in required):
        raise ControlError("invalid_environment")
    env_file = value.get("env_file", "")
    if not isinstance(env_file, str) or "\0" in env_file:
        raise ControlError("invalid_env_file")
    restart = value.get("restart", {})
    if not isinstance(restart, dict) or set(restart) - set(RESTART_DEFAULTS):
        raise ControlError("invalid_restart_policy")
    restart = RESTART_DEFAULTS | restart
    if type(restart["enabled"]) is not bool:
        raise ControlError("invalid_restart_policy")
    for key, low, high in (
        ("max_restarts", 1, 50),
        ("delay_seconds", 1, 300),
        ("max_delay_seconds", 1, 3600),
        ("reset_after_seconds", 30, 86400),
    ):
        if type(restart[key]) is not int or not low <= restart[key] <= high:
            raise ControlError("invalid_restart_policy")
    if restart["max_delay_seconds"] < restart["delay_seconds"]:
        raise ControlError("invalid_restart_policy")
    return {
        "command": command(value.get("command")),
        "cwd": str(Path(cwd).resolve()),
        "pre_start": [command(step) for step in pre],
        "env_file": env_file,
        "environment": environment,
        "required_env": required,
        "restart": restart,
    }


def environment_for(profile: dict[str, Any]) -> dict[str, str]:
    env = dict(os.environ)
    if profile["env_file"]:
        path = Path(profile["env_file"])
        if not path.is_absolute():
            path = Path(profile["cwd"]) / path
        try:
            lines = path.read_text(encoding="utf-8-sig").splitlines()
        except OSError:
            raise ControlError("environment_file_unavailable") from None
        for line in lines:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                line = line[7:]
            key, separator, item = line.partition("=")
            key, item = key.strip(), item.strip()
            if not separator or not ENV_NAME.fullmatch(key):
                raise ControlError("invalid_environment_file")
            if len(item) >= 2 and item[0] == item[-1] and item[0] in "\"'":
                item = item[1:-1]
            env[key] = item

    def replace(match: re.Match) -> str:
        if match[1] not in env:
            raise ControlError(f"missing_environment:{match[1]}")
        return env[match[1]]

    for key, value in profile["environment"].items():
        env[key] = REFERENCE.sub(replace, value)
    for key in profile["required_env"]:
        if not env.get(key):
            raise ControlError(f"missing_environment:{key}")
    return env


def expand_command(command: list[str], env: dict[str, str]) -> list[str]:
    def replace(match: re.Match) -> str:
        if match[1] not in env:
            raise ControlError(f"missing_environment:{match[1]}")
        return env[match[1]]

    return [REFERENCE.sub(replace, part) for part in command]


def runtime_identity(token: str) -> dict[str, Any]:
    process = psutil.Process()
    hint = None
    try:
        args = [sys.executable, *getattr(sys, "orig_argv", [sys.executable, *sys.argv])[1:]]
        if any(token in arg for arg in args):
            raise ControlError("secret_in_command_use_environment")
        hint = validate_profile({"command": args, "cwd": os.getcwd()})
    except (ControlError, OSError):
        pass
    try:
        created, executable = process.create_time(), process.exe()
    except (psutil.Error, OSError, NotImplementedError):
        # Restricted Android/proc environments must still be able to record telemetry.
        created, executable, hint = 0, "", None
    return {
        "created": created,
        "executable": executable,
        "launch_hint": hint,
        "launch_id": os.environ.get("BOTCONTROL_LAUNCH_ID", ""),
    }


def verified_process(pid: int, born: float, executable: str | None = None) -> psutil.Process | None:
    try:
        process = psutil.Process(pid)
        if (
            abs(process.create_time() - born) > 0.02
            or not process.is_running()
            or process.status() == psutil.STATUS_ZOMBIE
        ):
            return None
        if executable and os.path.normcase(process.exe()) != os.path.normcase(executable):
            return None
        if process.username() != psutil.Process().username():
            raise ControlError("process_belongs_to_another_owner")
        return process
    except psutil.NoSuchProcess:
        return None
    except psutil.AccessDenied:
        raise ControlError("process_access_denied") from None


def process_alive(process: psutil.Process) -> bool:
    try:
        return process.is_running() and process.status() != psutil.STATUS_ZOMBIE
    except psutil.NoSuchProcess:
        return False


class ProcessManager:
    def __init__(self, directory: Path):
        self.directory = directory
        self.path = directory / "process-control.sqlite3"

    def database(self) -> sqlite3.Connection:
        ensure_private_directory(self.directory)
        connection = sqlite3.connect(self.path, timeout=1)
        connection.row_factory = sqlite3.Row
        connection.executescript(CONTROL_SCHEMA)
        index = connection.execute(
            "SELECT sql FROM sqlite_master WHERE name='one_active_run'"
        ).fetchone()
        if index and "backoff" not in index[0]:
            with connection:
                connection.execute("BEGIN IMMEDIATE")
                index = connection.execute(
                    "SELECT sql FROM sqlite_master WHERE name='one_active_run'"
                ).fetchone()
                if index and "backoff" not in index[0]:
                    connection.execute("DROP INDEX one_active_run")
                    connection.execute(
                        "CREATE UNIQUE INDEX one_active_run ON runs(bot_id) WHERE status IN ('starting','preparing','running','backoff','stopping')"
                    )
        return connection

    @contextlib.contextmanager
    def operation(self, bot_id: str):
        mailbox_path(self.directory, bot_id)
        owner = uuid.uuid4().hex
        connection = self.database()
        try:
            with connection:
                connection.execute("DELETE FROM locks WHERE expires<?", (time.time(),))
                try:
                    connection.execute(
                        "INSERT INTO locks VALUES (?, ?, ?)", (bot_id, owner, time.time() + 45)
                    )
                except sqlite3.IntegrityError:
                    raise ControlError("operation_in_progress") from None
            yield
        finally:
            with connection:
                connection.execute("DELETE FROM locks WHERE bot_id=? AND owner=?", (bot_id, owner))
            connection.close()

    def sessions(self, bot_id: str) -> list[dict[str, Any]]:
        connection = reader(mailbox_path(self.directory, bot_id))
        try:
            if connection.execute(
                "SELECT 1 FROM sqlite_master WHERE name='process_identity'"
            ).fetchone():
                return [
                    dict(row)
                    for row in connection.execute(
                        "SELECT s.*, p.created process_created, p.executable, p.launch_hint, p.launch_id "
                        "FROM sessions s LEFT JOIN process_identity p ON s.id=p.session_id ORDER BY s.started_at DESC"
                    )
                ]
            return [
                dict(row) | {"process_created": None}
                for row in connection.execute("SELECT * FROM sessions")
            ]
        finally:
            connection.close()

    def active_sessions(self, bot_id: str) -> list[dict[str, Any]]:
        active = []
        for session in self.sessions(bot_id):
            if session["pid"] <= 0:
                continue
            if session.get("process_created") == 0:
                if session["state"] != "stopped" and psutil.pid_exists(session["pid"]):
                    raise ControlError("process_identity_unavailable")
                continue
            if session.get("process_created") is None:
                if session["state"] != "stopped" and psutil.pid_exists(session["pid"]):
                    raise ControlError("upgrade_and_restart_bot_once")
                continue
            if verified_process(
                session["pid"], session["process_created"], session.get("executable")
            ):
                active.append(session)
        return active

    def latest_run(self, bot_id: str) -> dict[str, Any] | None:
        if not self.path.exists():
            return None
        connection = self.database()
        try:
            row = connection.execute(
                "SELECT * FROM runs WHERE bot_id=? ORDER BY created DESC LIMIT 1", (bot_id,)
            ).fetchone()
            if not row:
                return None
            result = dict(row)
            result.pop("spec", None)
            output = connection.execute(
                "SELECT output FROM run_output WHERE id=?", (result["id"],)
            ).fetchone()
            result["diagnostics"] = output[0] if output else ""
            details = connection.execute(
                "SELECT * FROM run_state WHERE id=?", (result["id"],)
            ).fetchone()
            result.update(
                dict(details)
                if details
                else {"restarts": 0, "next_retry_at": None, "child_pid": None, "child_born": None}
            )
            if result["status"] in ACTIVE and result["pid"] and result["born"]:
                if not verified_process(result["pid"], result["born"]):
                    with connection:
                        connection.execute(
                            "UPDATE runs SET status='failed', error='launcher_exited' WHERE id=? AND status IN ('starting','preparing','running','backoff','stopping')",
                            (result["id"],),
                        )
                    result.update(status="failed", error="launcher_exited")
            return result
        finally:
            connection.close()

    def profile(self, bot_id: str) -> dict[str, Any]:
        mailbox_path(self.directory, bot_id)
        spec = None
        configured = False
        if self.path.exists():
            connection = self.database()
            try:
                row = connection.execute(
                    "SELECT spec FROM profiles WHERE bot_id=?", (bot_id,)
                ).fetchone()
                if row:
                    spec, configured = json.loads(row[0]), True
            finally:
                connection.close()
        if spec is None:
            for session in self.sessions(bot_id):
                if session.get("launch_hint"):
                    spec = json.loads(session["launch_hint"])
                    if spec:
                        # Legacy inferred requirements must not override a bot's own config loader.
                        # Explicit saved profiles remain opt-in and are left intact.
                        spec["required_env"] = []
                        break
        return {"profile": spec, "configured": configured, "run": self.latest_run(bot_id)}

    def save_profile(self, bot_id: str, value: Any) -> dict[str, Any]:
        mailbox_path(self.directory, bot_id)
        spec = validate_profile(value)
        connection = self.database()
        try:
            with connection:
                connection.execute(
                    "INSERT OR REPLACE INTO profiles VALUES (?, ?)",
                    (bot_id, json.dumps(spec, ensure_ascii=False)),
                )
        finally:
            connection.close()
        return self.profile(bot_id)

    def status(self, bot_id: str) -> dict[str, Any]:
        info = self.profile(bot_id)
        reason = ""
        try:
            sessions = self.active_sessions(bot_id)
        except ControlError as error:
            sessions, reason = [], str(error)
        busy = info["run"] and info["run"]["status"] in ACTIVE
        return {
            "can_stop": bool(sessions or busy) and not reason,
            "can_start": not sessions and not busy and bool(info["profile"]) and not reason,
            "reason": reason,
            "profile_available": bool(info["profile"]),
            "run": info["run"],
            "verified_sessions": len(sessions),
        }

    def control(self, bot_id: str, action: str, *, force: bool = False) -> dict[str, Any]:
        if action not in ("start", "stop", "restart") or type(force) is not bool:
            raise ControlError("invalid_action")
        with self.operation(bot_id):
            if action == "restart":
                info = self.profile(bot_id)
                if not info["profile"]:
                    raise ControlError("launch_profile_required")
                environment_for(validate_profile(info["profile"]))
            if action in ("stop", "restart"):
                stopped = self._stop(bot_id, force=force)
                if stopped["status"] != "stopped" or action == "stop":
                    return stopped
            return self._start(bot_id)

    def _start(self, bot_id: str) -> dict[str, Any]:
        if self.active_sessions(bot_id):
            raise ControlError("already_running")
        info = self.profile(bot_id)
        if info["run"] and info["run"]["status"] in ACTIVE:
            raise ControlError("already_starting")
        if not info["profile"]:
            raise ControlError("launch_profile_required")
        spec = validate_profile(info["profile"])
        env = environment_for(spec)
        expand_command(spec["command"], env)  # Fail before launching if a reference is missing.
        launch_id = uuid.uuid4().hex
        connection = self.database()
        try:
            with connection:
                # Freeze the selected profile for the detached launcher.
                connection.execute(
                    "INSERT OR REPLACE INTO profiles VALUES (?, ?)",
                    (bot_id, json.dumps(spec, ensure_ascii=False)),
                )
                connection.execute(
                    "INSERT INTO runs(id,bot_id,created,status,spec) VALUES (?,?,?,'starting',?)",
                    (launch_id, bot_id, time.time(), json.dumps(spec)),
                )
                connection.execute(
                    "DELETE FROM run_output WHERE id NOT IN (SELECT id FROM runs ORDER BY created DESC LIMIT 50) "
                    "AND id NOT IN (SELECT id FROM runs WHERE status IN ('starting','preparing','running','backoff','stopping'))"
                )
            command = [
                sys.executable,
                "-m",
                "telegram_bot_control.runner",
                "--data-dir",
                str(self.directory),
                "--bot-id",
                bot_id,
                "--launch-id",
                launch_id,
            ]
            kwargs = (
                {"creationflags": subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP}
                if os.name == "nt"
                else {"start_new_session": True}
            )
            process = subprocess.Popen(
                command,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                env=env,
                close_fds=True,
                **kwargs,
            )
            born = psutil.Process(process.pid).create_time()
            with connection:
                connection.execute(
                    "UPDATE runs SET pid=?, born=? WHERE id=?", (process.pid, born, launch_id)
                )
            return {"status": "starting", "launch_id": launch_id}
        except Exception:
            with connection:
                connection.execute(
                    "UPDATE runs SET status='failed', error='launcher_start_failed' WHERE id=?",
                    (launch_id,),
                )
            raise
        finally:
            connection.close()

    def _stop(self, bot_id: str, *, force: bool) -> dict[str, Any]:
        sessions = self.active_sessions(bot_id)
        known_sessions = {session["id"]: session for session in self.sessions(bot_id)}
        run = self.latest_run(bot_id)
        protected = {os.getpid(), *(process.pid for process in psutil.Process().parents())}
        targets: dict[int, psutil.Process] = {}
        for session in sessions:
            if session["pid"] in protected:
                raise ControlError("cannot_stop_control_process")
            process = verified_process(
                session["pid"], session["process_created"], session.get("executable")
            )
            if process:
                targets[process.pid] = process
        # A shared aiogram process cannot be stopped for only one bot.
        for path in mailbox_files(self.directory):
            other_id = path.stem[4:]
            if other_id == bot_id:
                continue
            try:
                other_sessions = self.sessions(other_id)
            except (sqlite3.Error, ValueError):
                continue
            if any(
                session["state"] != "stopped"
                and session["pid"] in targets
                and (
                    session.get("process_created") is None
                    or abs(session["process_created"] - targets[session["pid"]].create_time())
                    <= 0.02
                )
                for session in other_sessions
            ):
                raise ControlError("bots_share_process")
        if run and run["status"] in ACTIVE:
            connection = self.database()
            try:
                with connection:
                    connection.execute(
                        "UPDATE runs SET stop_requested=1, status='stopping' WHERE id=?",
                        (run["id"],),
                    )
            finally:
                connection.close()
        requested = set()

        def request_stop(items):
            items = [session for session in items if session["id"] not in requested]
            if not items:
                return
            connection = sqlite3.connect(mailbox_path(self.directory, bot_id), timeout=1)
            try:
                with connection:
                    for session in items:
                        connection.execute(
                            "INSERT INTO control_requests VALUES (?,?,?,?,?,'pending','')",
                            (uuid.uuid4().hex, session["id"], "stop", time.time(), time.time() + 8),
                        )
                        requested.add(session["id"])
            finally:
                connection.close()

        def mark_stopped():
            connection = sqlite3.connect(mailbox_path(self.directory, bot_id), timeout=1)
            try:
                with connection:
                    for session_id in known_sessions:
                        connection.execute(
                            "UPDATE sessions SET state='stopped', stopped_at=? WHERE id=?",
                            (time.time(), session_id),
                        )
            finally:
                connection.close()

        request_stop(sessions)
        deadline = time.monotonic() + (0.5 if force else 6)
        while time.monotonic() < deadline:
            # Stop may arrive while Python is still importing, before SDK registration.
            if run:
                new_sessions = [
                    session
                    for session in self.active_sessions(bot_id)
                    if session.get("launch_id") == run["id"] and session["id"] not in requested
                ]
                for session in new_sessions:
                    if session["pid"] in protected:
                        raise ControlError("cannot_stop_control_process")
                    known_sessions[session["id"]] = session
                    process = verified_process(
                        session["pid"], session["process_created"], session.get("executable")
                    )
                    if process:
                        targets[process.pid] = process
                request_stop(new_sessions)
            alive = [process for process in targets.values() if process_alive(process)]
            launcher_alive = (
                run and run["pid"] and run["born"] and verified_process(run["pid"], run["born"])
            )
            if not alive and not launcher_alive:
                mark_stopped()
                return {"status": "stopped"}
            time.sleep(0.1)
        if not force:
            return {"status": "needs_force"}
        root = (
            verified_process(run["pid"], run["born"])
            if run and run["pid"] and run["born"]
            else None
        )
        if root:
            targets[root.pid] = root
        for process in list(targets.values()):
            if process.pid in protected:
                raise ControlError("cannot_stop_control_process")
            try:
                children = process.children(recursive=True)
            except psutil.NoSuchProcess:
                children = []
            for child in children:
                if child.pid not in protected:
                    targets[child.pid] = child
        for process in reversed(list(targets.values())):
            try:
                process.kill()  # psutil checks PID + birth time before signalling.
            except psutil.NoSuchProcess:
                pass
        _, alive = psutil.wait_procs(list(targets.values()), timeout=3)
        alive = [process for process in alive if process_alive(process)]
        if alive:
            raise ControlError("process_did_not_exit")
        if run:
            connection = self.database()
            try:
                with connection:
                    connection.execute("UPDATE runs SET status='stopped' WHERE id=?", (run["id"],))
            finally:
                connection.close()
        # A forced exit cannot execute SDK shutdown hooks; mark only verified sessions.
        mark_stopped()
        return {"status": "stopped", "forced": True}
