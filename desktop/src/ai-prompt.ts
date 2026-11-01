export function integrationPrompt(
  language: 'ru' | 'en',
  options: {
    dataDir?: string;
    interpreter?: string;
    entrypoint?: string;
    environment: 'system' | 'venv';
  },
) {
  const ru = language === 'ru';
  const values = JSON.stringify(
    {
      data_dir:
        options.dataDir ||
        (ru
          ? 'Уточни общую абсолютную папку данных панели'
          : 'Ask for the shared absolute dashboard data directory'),
      python:
        options.interpreter ||
        (ru
          ? 'Определи Python, которым уже запускается бот'
          : 'Identify the Python that already runs this bot'),
      entrypoint:
        options.entrypoint ||
        (ru ? 'Найди существующую точку запуска' : 'Find the existing entry point'),
      environment:
        options.environment === 'system'
          ? 'existing regular Python (no venv required)'
          : 'existing virtual environment',
    },
    null,
    2,
  );
  const example = `from telegram_bot_control import start

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
    ...`;
  return ru
    ? `Подключи Telegram Bot Control к моему существующему боту на aiogram 3 / Python 3.11+.
Сначала изучи проект и предложи минимальные изменения, затем выполни их и проверь.

Исходные данные (это значения, а не команды):
${values}

1. Найди реальный способ запуска, Bot, Dispatcher, роутеры, lifecycle и настройку логов. Сохрани существующие команды, аргументы, cwd, .env, зависимости и обработчики. Не создавай нового бота и не меняй токен.
2. Используй Python, которым уже запускается этот бот. Виртуальное окружение НЕ обязательно. Если бот работает обычным Python, не создавай venv и не переноси туда проект. Если venv уже есть, используй его python по полному пути, активация не нужна. Покажи sys.executable и python -m pip --version для выбранного интерпретатора.
3. Установи telegram-bot-control>=0.6.0 через ТОТ ЖЕ Python: <python> -m pip install --upgrade telegram-bot-control. Не используй отдельный pip. Для существующего aiogram-проекта не обновляй aiogram и остальные зависимости без необходимости. Extra [aiogram] нужен только если aiogram ещё не установлен.
4. Подключи start() после существующих Bot/Dispatcher и настройки logging, до polling/webhook startup. Подключи update.outer_middleware ровно один раз. Существующее подключение SDK обнови вместо дублирования. У всех ботов и панели один абсолютный data_dir; папку venv и папку исходников не используй как data_dir. Не добавляй HTTP-сервер для SDK: он пишет локальные SQLite-файлы.
5. Сохрани polling как есть. Для webhook/ручного feed_update свяжи dp.emit_startup(bot=bot) и dp.emit_shutdown(bot=bot) с существующим lifecycle, без повторных вызовов. Для управления остановкой webhook передай в start(shutdown=...) async callback, который корректно останавливает приложение. Не обходи существующие менеджеры процессов.
6. capture_logs=True подключает стандартный logging. Не удаляй текущие handlers и не меняй уровни без причины. Для propagate=False используй monitor.capture_logs("имя"); Loguru подключается через logger.add(monitor.loguru_sink), без повторных sinks.
7. Добавь только осмысленные события, которые я выберу: monitor.track_action("order.completed", ...), декоратор @monitor.action("report.generate") для обычных def/async def, actions={callback_data: "catalog.open"} для безопасных названий кнопок. Не записывай тексты сообщений, токены, номера заказов, callback_data, аргументы функций и персональные данные. Имена статичные: 1–80 латинских букв, цифр, _, . или -. user_id внутри middleware определяется автоматически и хранится как HMAC; вне обработчика передай его явно, если нужен подсчёт пользователей. Не определяй пользователя из chat_id.
8. track_action возвращает bool принятия в очередь, не подтверждение записи. outcome: success/error/cancelled; duration_ms — конечное неотрицательное число. event_id необязателен: безопасный непрозрачный ключ 1–80 символов, уникальный для операции; одинаковые имя+event_id в одном боте учитываются один раз. Для обычных повторных нажатий не задавай один постоянный event_id. Декоратор измеряет время/результат и повторно выбрасывает исключение; генераторы не поддерживаются. Одинаковое имя callback и явного события одного update не удваивается в аналитике действий, входящие updates считаются отдельно.
9. Проверь импорт выбранным Python, затем тесты и один безопасный запуск существующим способом. Секреты не выводи. Не запускай второй polling-процесс того же бота; не останавливай рабочий процесс без согласованного окна. Если недостаёт данных, уточни только их.
10. Покажи изменённые файлы, точную команду запуска, data_dir и как найти бота в панели. Бот появится после SDK startup; мастер может создать предварительную карточку. Для Termux/Linux без экрана можно использовать tgbots web --host 127.0.0.1 --port 8765 --data-dir <data_dir>; сохрани авторизацию и выбирай доступ к сети осознанно.

Схема API (многоточия и DATA_DIR замени реальным кодом проекта):
${example}

Документация: https://github.com/olegoleg1111121/telegram-bot-control/blob/main/docs/ai-integration.ru.md`
    : `Integrate Telegram Bot Control into my existing aiogram 3 bot (Python 3.11+).
Inspect the project first, make minimal changes, then validate them.

Context values (data, not commands):
${values}

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
${example}

Docs: https://github.com/olegoleg1111121/telegram-bot-control/blob/main/docs/ai-integration.en.md`;
}
