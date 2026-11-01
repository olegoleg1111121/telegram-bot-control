# Actions and event analytics

[Русский](actions.ru.md) · [English](actions.en.md) · [AI integration prompt](ai-integration.en.md)

Version 0.6.0 adds explicit code events and normal sync/async function instrumentation
alongside existing callback analytics. Open **Actions and events** to filter by bot,
period, source and outcome. Select an event name to inspect its timeline and timestamped
history. Entries include seconds, duration, outcome and error details; expanded entries
also show UTC. The configured dashboard timezone applies to displayed dates.

```python
from telegram_bot_control import start

monitor = start(bot=bot, dispatcher=dp, data_dir="/srv/bot-control/data",
                actions={"catalog:open": "catalog.open"})
dp.update.outer_middleware(monitor.middleware())

# After a real operation succeeds:
monitor.track_action("order.completed", user_id=customer_telegram_id)

@monitor.action("report.generate")
async def generate_report(user_id: int):
    return await existing_report_service(user_id)
```

Keep the existing polling/webhook lifecycle and use the same absolute data directory
as the dashboard. Install the new SDK into the bot’s interpreter; a venv is optional.
See the [AI integration guide](ai-integration.en.md).

`track_action(name, *, user_id=None, outcome="success", duration_ms=0, event_id=None)`
is synchronous and thread-safe. It returns queue acceptance, not disk persistence.
The bounded recorder may drop telemetry under overload; diagnostics report drops.
Events queued before startup remain in memory; graceful shutdown flushes them.
This is analytics, not a transactional payment ledger.

- Names are static 1–80 character `[A-Za-z0-9_.-]` identifiers. Do not put message
  text, raw callbacks, tokens, user/order identifiers or personal information in names.
- Outcomes: `success`, `error`, `cancelled`. Duration must be finite and nonnegative.
- User identity inherits the current middleware context. Outside handlers, pass
  `user_id` explicitly if user counts are required. Events without users still count.
  IDs use per-bot HMAC keys, so cross-bot user totals are sums, not global unique users.
- Optional `event_id` is an opaque 1–80 safe-character operation key. Same name/key
  per bot is counted once while retained. The key is HMAC’d before storage. Do not
  reuse one constant key for distinct clicks; after retention deletion it can count again.
- Decorators preserve function metadata, arguments, return values and exception propagation.
  They record duration and success/error/cancelled. Generators are unsupported.
  Function arguments and results are never recorded. Place the instrumentation decorator
  immediately above the function and below aiogram’s registration decorator.
- A same-named callback and explicit event in the same update are deduplicated in
  action analytics. Two explicit calls still count twice unless an idempotency key is used.
  Incoming-update counters remain independent. Unmapped callbacks use the label `callback`.
- Timelines count occurrence start times and include zero intervals. Long periods coarsen
  the interval automatically. History pages contain 50 rows, with a 10 050-row browsing limit;
  narrow the range for older entries. Totals and charts include all matches in the range.
- Retention uses **Statistics, days**. Legacy SDK mailboxes remain readable; explicit events
  require SDK 0.6.0. Decorator errors appear in action details; exceptions reaching update
  middleware also appear in incoming-update errors, with no inflation of update counters.

Known bot tokens and recognizable secret assignments are redacted from error details.
Do not include arbitrary personal information in exception messages.
