# Telegram Bot Control

[Русский](README.md) · [English](README.en.md)

Monitor and control existing aiogram bots: one owner, one Windows/Linux server, many bots.

## Install and launch

Python 3.11+ is required:

```sh
python -m pip install --upgrade telegram-bot-control
tgbots
```

The bundled dashboard opens in your browser, signs in locally, and uses its own Python
and the current owner's default data directory. Keep the terminal open; Ctrl+C stops
the dashboard while bots continue running. If `tgbots` is not on PATH, use
**`python -m telegram_bot_control`**. On Linux use `python3`; Windows also supports `py`.
Node.js, pnpm and a separate desktop installer are unnecessary for this mode.

The [optional desktop application](https://github.com/olegoleg1111121/telegram-bot-control/releases/tag/v0.7.0)
automatically discovers installed Python runtimes and checks the SDK. Connection errors
open a dialog with a specific fix. Use `tgbots desktop` to open the installed Electron app.

## Connect an existing bot

After your existing Bot/Dispatcher are created and before polling:

```python
from telegram_bot_control import start

monitor = start(bot=bot, dispatcher=dp, capture_logs=True)
dp.update.outer_middleware(monitor.middleware())
```

Keep your existing routers, logging, .env loader and launch command. Start the bot
normally once; it appears automatically. The dashboard also has a **Connect a bot** wizard.
By default, the bot and dashboard use the current owner's shared data directory.
If you set `data_dir`, use the same path in both.

**Working with AI?** [Copy the integration task](docs/ai-integration.en.md), also available
under **Connect with AI** in the dashboard.

## Features

- Bot status, users, messages, commands and callbacks.
- Custom events and sync/async function decorators, timelines, exact timestamps and outcomes.
- Existing logging/Loguru adapters, searchable logs and detailed startup errors.
- Per-process CPU, RSS and thread history.
- Explicit launch profiles, preparation steps, start/stop/restart and bounded automatic retries.
- Russian/English UI, first-run guide, tray and configurable retention.

![Dashboard with synthetic demonstration data](docs/assets/overview.png)

## Try without a real bot

First terminal:

```sh
python -m pip install "telegram-bot-control[aiogram]"
python -m telegram_bot_control demo --bots 3
```

Second terminal:

```sh
tgbots
```

Use `python3` on Linux. Open the displayed URL and enter the dashboard key.
The demo uses synthetic events; no Telegram token is required.

[Action analytics](docs/actions.en.md) · [AI integration](docs/ai-integration.en.md)
· [Process profiles](docs/process-control.md) · [Transport](docs/transport.md) · [Changelog](CHANGELOG.md).

**Changing the source code?** Follow the separate [developer setup](docs/development.en.md),
including Node.js and pnpm download/install instructions.

Early preview for one trusted owner. History begins at SDK connection. Bots sharing
one process share resources and cannot stop independently. Desktop Python is installed
separately. The Windows installer is currently unsigned.

Created by [Дмитрий Варг](https://github.com/olegoleg1111121). [MIT](LICENSE).
