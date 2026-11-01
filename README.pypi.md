# Telegram Bot Control

Monitoring and process control for existing aiogram bots. One owner, one Windows
or Linux server, many bots. Includes an embedded Python SDK, an optional browser
dashboard and a separately distributed desktop application.

## Install

For an aiogram bot:

```sh
python -m pip install "telegram-bot-control[aiogram]"
```

For the lightweight web dashboard or stdio/SSH reader:

```sh
python -m pip install telegram-bot-control
```

Requires Python 3.11+. The base package depends only on psutil. The wheel includes
the web UI and local Latin/Cyrillic fonts; Node.js and Electron are not required
for browser mode. Windows setup and Linux AppImage are distributed through
[GitHub Releases](https://github.com/olegoleg1111121/telegram-bot-control/releases).

## Connect your bot

After creating your existing Bot and Dispatcher, add this inside your startup
function, before polling:

```python
from telegram_bot_control import start

monitor = start(
    bot=bot,
    dispatcher=dp,
    data_dir="/srv/bot-control/data",  # choose your own absolute directory
)
dp.update.outer_middleware(monitor.middleware())

await dp.start_polling(bot)
```

Use the same data directory for all connected bots and the dashboard. On Windows,
an example is `data_dir=r"C:\BotControl\data"`. Keep your existing handlers,
routers, environment loader and polling call. The SDK writes bounded batches to
per-bot SQLite WAL files without opening a listening port in the bot.

Start the optional browser dashboard:

```sh
tgbots web --port 8765 --data-dir /srv/bot-control/data
```

The terminal displays a loopback URL and a separate dashboard access key.
For network access and Termux, see the
[web dashboard guide](https://github.com/olegoleg1111121/telegram-bot-control/blob/main/docs/web-panel.ru.md).
The default mode is local HTTP; use an HTTPS proxy or SSH tunnel for untrusted networks.

## Features

- Bot status, message/command/button counters and retained error history.
- Existing Python logging and optional Loguru adapters, search and secret redaction.
- CPU, RSS and thread history for each bot's Python process.
- Explicit launch profiles: arguments, working directory, preparation steps and optional env-file.
- Start, graceful stop, restart and bounded on-failure automatic restarts.
- Detailed startup stderr/stdout, including failures before SDK initialization.
- Russian/English interfaces and configurable retention.

Optional integration with an already configured logger:

```python
monitor.capture_logs()  # standard logging; existing handlers are preserved
# For Loguru, use logger.add(monitor.loguru_sink, level="INFO") instead.
```

This is an early preview for a single trusted owner. Process control verifies PID,
creation time and owner. Multiple bots sharing one Python process share resource
measurements and cannot be stopped independently. It does not install an OS boot
service or import historical log files.

Created by [Дмитрий Варг](https://github.com/olegoleg1111121). MIT license.

[Source and documentation](https://github.com/olegoleg1111121/telegram-bot-control)
· [Russian walkthrough](https://github.com/olegoleg1111121/telegram-bot-control/blob/main/docs/getting-started.ru.md)
· [Issues](https://github.com/olegoleg1111121/telegram-bot-control/issues)
