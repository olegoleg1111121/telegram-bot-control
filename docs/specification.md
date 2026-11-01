# Product scope

One owner manages aiogram bots on one Windows or Linux server. Each bot can use
its own folder and Python environment. The desktop runs locally or reads a bridge
on the Linux server through SSH.

Required behavior: explicit SDK startup, separately attached middleware, stable bot
identity, collection independent of the UI, heartbeat state, aggregate analytics,
exact unique users, grouped errors, Russian/English interface, retention, backups,
and real process-control buttons with explicit launch profiles.

Defaults: statistics 365 days, errors 30 days, diagnostics 7 days; heartbeat 10 seconds,
connection timeout at least three heartbeat intervals. The owner can change these.

Boundaries: single owner/server, local disk, separate OS processes for independently
controlled bots. External service adapters, console streaming, code signing and a
bundled Python runtime are future work.

See [architecture](architecture.md), [transport](transport.md), and
[process control](process-control.md).
