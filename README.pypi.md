# Telegram Bot Control

[Русский](#russian) · [English](#english)

<a id="russian"></a>

## Русский

Управление и мониторинг существующих Telegram-ботов на aiogram. Один владелец,
один Windows/Linux-сервер, много ботов. Python SDK внутри бота, тёмная панель
на русском/английском, отдельное desktop-приложение и необязательный веб-режим.

### Установка

Python 3.11+. **Venv не обязателен**: используйте Python, которым бот уже запускается.
Для существующего aiogram-проекта:

```sh
python -m pip install --upgrade telegram-bot-control
```

Если aiogram ещё не установлен: `python -m pip install "telegram-bot-control[aiogram]"`.
Базовый пакет зависит только от psutil; веб-интерфейс и локальные шрифты с кириллицей
включены. Node.js/Electron для веб-режима не нужны. Приложение Windows и Linux AppImage:
[GitHub Releases](https://github.com/olegoleg1111121/telegram-bot-control/releases).

### Подключение к существующему боту

После создания Bot и Dispatcher, до существующего polling/webhook startup:

```python
from telegram_bot_control import start

monitor = start(bot=bot, dispatcher=dp, data_dir="/srv/bot-control/data",
                capture_logs=True,
                actions={"catalog:open": "catalog.open"})
dp.update.outer_middleware(monitor.middleware())

# В нужной точке кода после реальной операции:
monitor.track_action("order.completed")
```

На Windows пример папки: `data_dir=r"C:\BotControl\data"`. У ботов и панели должна
быть одна абсолютная папка данных. Сохраните свои роутеры, `.env`, логгер и способ
запуска. SDK записывает локальные SQLite WAL-файлы без HTTP-сервера внутри бота.

**Работаете с нейросетью?** [Готовый промпт для подключения к вашему проекту](https://github.com/olegoleg1111121/telegram-bot-control/blob/main/docs/ai-integration.ru.md).
Есть инструкции для обычного Python и venv; копирование доступно и в панели.

Веб-панель, в том числе для Linux/Termux:

```sh
tgbots web --host 127.0.0.1 --port 8765 --data-dir /srv/bot-control/data
```

В терминале появятся адрес и отдельный ключ доступа. [Веб-режим и доступ с другого устройства](https://github.com/olegoleg1111121/telegram-bot-control/blob/main/docs/web-panel.ru.md).

### Возможности 0.6.0

- Состояние ботов, пользователи, сообщения, команды, кнопки и история ошибок.
- Свои события `monitor.track_action()` и декоратор `@monitor.action()` для функций:
  графики, точное время срабатывания, результат, длительность, фильтры и история.
- Подключение существующих logging/Loguru, поиск и маскирование секретов.
- CPU, память RSS и потоки процесса каждого бота.
- Запуск/остановка/перезапуск, сложные команды и подготовительные шаги, ограниченный автоперезапуск.
- Настраиваемое хранение истории, русский/английский интерфейс, обучение и мастер подключения.

[Документация событий](https://github.com/olegoleg1111121/telegram-bot-control/blob/main/docs/actions.ru.md)
· [Подробный первый запуск](https://github.com/olegoleg1111121/telegram-bot-control/blob/main/docs/getting-started.ru.md)
· [Репозиторий](https://github.com/olegoleg1111121/telegram-bot-control).

Ранняя версия для одного доверенного владельца. Если несколько ботов работают
в одном Python-процессе, ресурсы у них общие и остановка затрагивает весь процесс.
Автозагрузка как системная служба и импорт старых файлов логов пока не реализованы.

---

<a id="english"></a>

## English

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

**Working with AI?** [Copy the integration prompt](https://github.com/olegoleg1111121/telegram-bot-control/blob/main/docs/ai-integration.en.md). Regular Python and existing venvs are supported.

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

- Custom events and sync/async function decorators, timelines, outcomes, duration and occurrence history.
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
