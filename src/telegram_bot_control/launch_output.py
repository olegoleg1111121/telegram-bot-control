"""Bounded, redacted stdout/stderr capture, including failures before SDK startup."""

from __future__ import annotations

import codecs
import queue
import re
import subprocess
import threading

from .privacy import redact

MAX_LINE = 8192
MAX_OUTPUT = 32768
ANSI = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")


class LaunchOutput:
    def __init__(self, child: subprocess.Popen, secrets: list[str], phase: str):
        self.lines: queue.Queue[str] = queue.Queue(maxsize=128)
        self.dropped = 0
        self.phase = phase
        self.secrets = secrets
        self.streams = [child.stdout, child.stderr]
        self.threads = [
            threading.Thread(target=self._read, args=(stream, name), daemon=True)
            for stream, name in zip(self.streams, ("stdout", "stderr"))
        ]
        for thread in self.threads:
            thread.start()

    def _offer(self, text: str, source: str) -> None:
        text = redact(ANSI.sub("", text), self.secrets).replace("\0", "")
        try:
            self.lines.put_nowait(f"[{self.phase} / {source}] {text}\n")
        except queue.Full:
            self.dropped += 1

    def _read(self, stream, source: str) -> None:
        decoder = codecs.getincrementaldecoder("utf-8")("replace")
        pending, discarding = "", False
        try:
            while True:
                block = stream.read1(4096)
                pending += decoder.decode(block, final=not block)
                while "\n" in pending:
                    line, _, pending = pending.partition("\n")
                    if not discarding:
                        self._offer(
                            line.rstrip("\r")
                            if len(line) <= MAX_LINE
                            else "[long output line omitted]",
                            source,
                        )
                    discarding = False
                if len(pending) > MAX_LINE:
                    if not discarding:
                        self._offer("[long output line omitted]", source)
                    pending, discarding = "", True
                if not block:
                    if pending and not discarding:
                        self._offer(pending.rstrip("\r"), source)
                    return
        except (OSError, ValueError):
            return
        finally:
            stream.close()

    def drain(self, connection, launch_id: str) -> None:
        batch = []
        for _ in range(128):
            try:
                batch.append(self.lines.get_nowait())
            except queue.Empty:
                break
        if self.dropped:
            batch.append(f"[capture] {self.dropped} output lines omitted: queue full\n")
            self.dropped = 0
        if batch:
            with connection:
                connection.execute(
                    "INSERT INTO run_output(id,output) VALUES (?,?) ON CONFLICT(id) "
                    "DO UPDATE SET output=substr(run_output.output || excluded.output,-?)",
                    (launch_id, "".join(batch)[-MAX_OUTPUT:], MAX_OUTPUT),
                )

    def finish(self, connection, launch_id: str) -> None:
        # A background descendant may still hold a pipe; never wait indefinitely.
        for thread in self.threads:
            thread.join(timeout=0.3)
        for _ in range(3):
            self.drain(connection, launch_id)
            if self.lines.empty():
                break
