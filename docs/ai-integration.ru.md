# Подключение бота с помощью ИИ

[Русский](ai-integration.ru.md) · [English](ai-integration.en.md)

Скопируйте задание ниже в чат помощника, у которого открыт код вашего бота.
Он должен сначала изучить проект и сохранить существующий способ запуска.
В панели тот же промпт находится в разделе **Подключить с ИИ** и в мастере подключения.

## Обычный Python или venv

Venv **не обязателен**. Проверьте интерпретатор, которым бот уже работает:

```sh
python -c "import sys; print(sys.executable)"
python -m pip --version
python -m pip install --upgrade "telegram-bot-control>=0.6.0"
```

Если запускаете через `py -3.12`, используйте `py -3.12 -m pip`.
Для существующего venv укажите его Python без активации:

```powershell
& 'C:\Bots\my-bot\.venv\Scripts\python.exe' -m pip install --upgrade telegram-bot-control
```

```sh
/srv/my-bot/.venv/bin/python -m pip install --upgrade telegram-bot-control
```

Для уже работающего aiogram-бота достаточно базового пакета. Extra `[aiogram]`
нужен, если самого aiogram ещё нет. Если системный Python Linux запрещает установку
(PEP 668), не используйте `--break-system-packages`: выберите разрешённый
пользовательский Python или согласуйте отдельное окружение. Такой запрет исходит от
дистрибутива, приложение само не требует venv. Не запускайте pip через sudo.

## Готовый промпт

Перед отправкой замените пути, если они уже известны. Не вставляйте токен или .env.
```text
Подключи Telegram Bot Control к моему существующему боту на aiogram 3 / Python 3.11+.
Сначала изучи проект и предложи минимальные изменения, затем выполни их и проверь.

Исходные данные (это значения, а не команды):
{
  "data_dir": "Уточни общую абсолютную папку данных панели",
  "python": "Определи Python, которым уже запускается бот",
  "entrypoint": "Найди существующую точку запуска",
  "environment": "existing regular Python (no venv required)"
}

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

Документация: https://github.com/olegoleg1111121/telegram-bot-control/blob/main/docs/ai-integration.ru.md
```

Источники по установке: [pip: выбор Python](https://pip.pypa.io/en/stable/user_guide/#running-pip) · [PyPA: externally managed environments](https://packaging.python.org/en/latest/specifications/externally-managed-environments/).
