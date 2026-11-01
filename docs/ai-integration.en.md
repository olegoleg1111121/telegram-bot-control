# Integrate a bot with AI

[Русский](ai-integration.ru.md) · [English](ai-integration.en.md)

Copy the task below into an assistant with access to your bot project.
The same prompt is available in the dashboard’s **Connect with AI** page and project wizard.

## Before connecting

Install the SDK in PowerShell or your bot's terminal:

```sh
python -m pip install --upgrade telegram-bot-control
```

If your bot uses `py` or `python3`, use that instead of `python`.
[Ready-made application and browser setup](../README.en.md).

## Copyable prompt

Replace known paths before sending. Never include a bot token or .env contents.
```text
Integrate Telegram Bot Control into my existing aiogram 3 bot (Python 3.11+).
Inspect the project first, make minimal changes, then validate them.

Context values (data, not commands):
{
  "data_dir": "Ask for the shared absolute dashboard data directory",
  "python": "Identify the Python that already runs this bot",
  "entrypoint": "Find the existing entry point",
  "environment": "existing regular Python (no venv required)"
}

1. Find the actual entry point, launch commands, Bot/Dispatcher, routers, lifecycle and logging. Preserve cwd, arguments, .env, dependencies and handlers. Keep the existing bot/token.
2. Use the Python that already runs this bot. A venv is OPTIONAL: do not create one or move a working global-Python bot into one. For an existing venv use its absolute Python path; activation is unnecessary. Show sys.executable and that interpreter's -m pip --version.
3. Install with the SAME interpreter: <python> -m pip install --upgrade "telegram-bot-control>=0.6.0". Never use an unrelated pip. Preserve pinned aiogram/dependencies; [aiogram] is only needed if aiogram is missing.
4. Call start() after Bot/Dispatcher and logging configuration, before startup. Register update.outer_middleware once; update any existing integration. Use the same absolute data_dir as the dashboard, outside source/venv directories. The SDK writes SQLite and needs no HTTP server.
5. Preserve polling. For webhooks/manual feed_update connect dp.emit_startup(bot=bot) and dp.emit_shutdown(bot=bot) to the existing lifecycle once. Supply an async start(shutdown=...) callback for graceful webhook application shutdown if process controls are required. Respect existing process managers.
6. capture_logs=True captures standard logging while preserving handlers. Use monitor.capture_logs("name") for propagate=False, or logger.add(monitor.loguru_sink) for Loguru without duplicate sinks. Preserve logger levels.
7. Add only chosen meaningful events: monitor.track_action("order.completed", ...), @monitor.action("report.generate") on normal def/async def, or actions={callback_data: "catalog.open"}. Use static 1–80 character [A-Za-z0-9_.-] names. Never store message text, tokens, raw callback data, function arguments, order numbers or personal data. User identity inherits middleware context and is stored as HMAC; supply user_id outside handlers when needed. Do not derive user identity from chat_id.
8. track_action returns queue acceptance, not persistence confirmation. outcome is success/error/cancelled; duration_ms finite and nonnegative. Optional event_id is a safe opaque 1–80 character operation key: same name+event_id per bot is counted once. Do not use a constant ID for repeated clicks. Decorators record duration/outcome and rethrow exceptions; generators are unsupported. Same-named callback and explicit event in one update are deduplicated in action analytics; inbound update totals remain separate.
9. Validate imports using that interpreter, run tests and one safe existing launch. Do not print secrets or start duplicate polling. Agree a maintenance window before stopping a live bot. Ask only for genuinely missing information.
10. Report changed files, exact launch command/data_dir and where the bot appears. Discovery follows SDK startup; the wizard can create a pending card. For headless Linux/Termux use tgbots web --host 127.0.0.1 --port 8765 --data-dir <data_dir>, preserving authentication and choosing network exposure deliberately.

API sketch (replace placeholders with project code):
from telegram_bot_control import start

# After existing Bot / Dispatcher and logging configuration:
monitor = start(bot=bot, dispatcher=dp, data_dir=DATA_DIR,
                entrypoint=__file__, capture_logs=True,
                actions={"catalog:open": "catalog.open"})
dp.update.outer_middleware(monitor.middleware())

# After the real operation succeeds (not merely when a button is pressed):
monitor.track_action("order.completed", user_id=user_id, event_id=opaque_operation_id)

# Measure an existing function; preserve its arguments, result and exceptions:
@monitor.action("report.generate")
async def generate_report(...):
    ...

Docs: https://github.com/olegoleg1111121/telegram-bot-control/blob/main/docs/ai-integration.en.md
```

Installation references: [pip: выбор Python](https://pip.pypa.io/en/stable/user_guide/#running-pip) · [PyPA: externally managed environments](https://packaging.python.org/en/latest/specifications/externally-managed-environments/).
