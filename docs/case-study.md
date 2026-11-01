# Engineering notes

## Problem

Several Telegram bots run from different folders and Python environments on one
server. Their owner needs one place to inspect state, activity and exceptions,
and to reproduce each bot's real launch sequence.

The project combines a Python integration library with a desktop application.
A core constraint is that collecting data must continue after the UI closes.

## Main decisions

### Durable local transport

Each bot writes a bounded telemetry queue to its own SQLite WAL file. A desktop-owned
Python reader receives JSON-line requests over stdin/stdout. The Linux path runs
that same reader through SSH. No application-specific listening port is needed.

Per-bot files reduce write contention between unrelated bot processes. This adds
query fan-out for the overview and means the data directory must be shared by the
owner's bot environments. Files are local to the server; SMB/NFS is not a supported
SQLite transport.

### Explicit process identity

A PID can be reused after a process exits. The SDK records creation time and
executable together with the session ID. Stop operations check identity and ownership,
try a cooperative callback, and expose forced termination separately.

Launches are serialized in SQLite. A detached launcher executes preparation steps,
starts the target with an argument array, records exit status, and survives closure
of the reader. It does not accept network connections.

### Reproducible launch profiles

The Python process can report its own original arguments. It cannot reliably infer
commands previously entered in a shell. Explicit profiles capture wrappers,
preparation, working directories, environment-file paths and required variables.

The profile stores references to secrets, not their values. Missing required values
fail preflight before a restart stops an existing process.

### Analytics semantics

Unique users over an interval use distinct pseudonymous identifiers across that
whole interval. Daily unique counts are not summed. The overview clearly labels its
sum of per-bot users. Message bodies and original Telegram updates are not needed.

## Validation approach

Offline sessions prohibit Telegram network calls while real aiogram routers,
FSM, handlers and middleware execute. Separate process fixtures test arguments,
PowerShell wrappers, cancellation, PID identity and child processes. Electron smoke
harnesses exercise the actual Start, Restart and Stop controls through the real bridge.

A live bot was also registered and restarted during development. Credentials,
identities and runtime databases are excluded from publication. All screenshots
use generated demo data.

## Current tradeoffs

The release is a preview. Windows is locally validated; hosted Linux checks are
configured for the first push. Large retained histories need longer performance
runs. An external service manager needs a dedicated adapter. Python remains a
separate dependency of the desktop package.
