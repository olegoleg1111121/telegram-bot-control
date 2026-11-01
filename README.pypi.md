# Telegram Bot Control

[Русский](#русский) · [English](#english)

## Русский

Панель мониторинга и управления существующими aiogram-ботами на Windows/Linux.
Для готовой программы достаточно **Python 3.11+**. Node.js, pnpm, Git и сборка исходников не нужны.
Используйте обычный Python, которым уже запускаете бота.

### Отдельное приложение Windows

1. В PowerShell установите библиотеку:

   ```powershell
   python -m pip install --upgrade telegram-bot-control
   ```

2. [Скачайте установщик Windows](https://github.com/olegoleg1111121/telegram-bot-control/releases/download/v0.6.1/Telegram-Bot-Control-0.6.1-win-x64.exe)
   и запустите его.
3. Откройте **Telegram Bot Control** ярлыком. В обучении выберите **Локально**,
   в поле Python введите `python` и нажмите **Подключиться**.

Если бота запускаете через `py main.py`, устанавливайте пакет командой
`py -m pip install --upgrade telegram-bot-control`. Если Python ещё нет,
[скачайте его с python.org](https://www.python.org/downloads/windows/) и заново откройте PowerShell.

### Самый короткий вариант — в браузере

Установите пакет и запустите панель:

```sh
python -m pip install --upgrade telegram-bot-control
python -m telegram_bot_control web --port 8765
```

На Linux используйте **python3** вместо **python** в обеих командах.
Откройте **http://127.0.0.1:8765**, введите ключ из терминала и оставьте терминал открытым.
`Ctrl+C` остановит панель. [Termux и доступ из сети](https://github.com/olegoleg1111121/telegram-bot-control/blob/main/docs/web-panel.ru.md).

### Как добавить бота

В его главном файле после создания существующих `bot` и `dp`, перед polling:

```python
from telegram_bot_control import start

monitor = start(bot=bot, dispatcher=dp, capture_logs=True)
dp.update.outer_middleware(monitor.middleware())
```

Запустите бота привычной командой — карточка появится автоматически.
Оставьте свои роутеры, `.env` и логгер. По умолчанию бот и панель используют общую
папку текущего пользователя. Если задаёте `data_dir`, он должен совпадать в обоих местах.

**Работаете с ИИ?** [Скопируйте готовый промпт](https://github.com/olegoleg1111121/telegram-bot-control/blob/main/docs/ai-integration.ru.md).
[Подробная инструкция первого запуска](https://github.com/olegoleg1111121/telegram-bot-control/blob/main/docs/getting-started.ru.md).

### Возможности

- Состояние ботов, пользователи, сообщения, команды, кнопки и история ошибок.
- Свои события `monitor.track_action()` и `@monitor.action()` для функций:
  графики, время срабатывания, длительность и результат.
- Существующие logging/Loguru, поиск по логам, подробности ошибок запуска.
- CPU, RSS и потоки процесса каждого бота.
- Запуск/остановка/перезапуск, сложные команды и ограниченный автоперезапуск.
- Русский/английский интерфейс, обучение, трей и настройки хранения.

Базовый пакет зависит только от psutil. Для существующего aiogram-проекта достаточно
базового пакета; если aiogram ещё не установлен, используйте
`python -m pip install "telegram-bot-control[aiogram]"`.
Веб-интерфейс и шрифты с кириллицей уже включены в пакет.

[Все готовые сборки](https://github.com/olegoleg1111121/telegram-bot-control/releases/tag/v0.6.1)
· [События и аналитика](https://github.com/olegoleg1111121/telegram-bot-control/blob/main/docs/actions.ru.md)
· [Разработка из исходников](https://github.com/olegoleg1111121/telegram-bot-control/blob/main/docs/development.ru.md).

---

## English

Monitor and control existing aiogram bots on Windows/Linux. **Python 3.11+** is enough
for the ready-made application; Node.js, pnpm and a source build are not required.
Use the same Python that already runs your bot.

### Windows desktop

```powershell
python -m pip install --upgrade telegram-bot-control
```

[Download the Windows installer](https://github.com/olegoleg1111121/telegram-bot-control/releases/download/v0.6.1/Telegram-Bot-Control-0.6.1-win-x64.exe),
run it and open its desktop/Start menu shortcut. Choose Local, enter `python` and click Connect.
If your bot uses `py main.py`, install through `py -m pip` instead.

### Browser setup

```sh
python -m pip install --upgrade telegram-bot-control
python -m telegram_bot_control web --port 8765
```

Use `python3` on Linux. Open **http://127.0.0.1:8765**, enter the terminal access key
and keep that terminal open. Ctrl+C stops the dashboard.

### Connect an existing bot

```python
from telegram_bot_control import start

monitor = start(bot=bot, dispatcher=dp, capture_logs=True)
dp.update.outer_middleware(monitor.middleware())
```

Add this after your existing Bot/Dispatcher and before polling. Preserve existing
routers, logging, .env and launch commands. Start the bot normally to register it.
The bot and dashboard use the owner's shared directory by default; any explicit
`data_dir` must match. [Copyable AI integration task](https://github.com/olegoleg1111121/telegram-bot-control/blob/main/docs/ai-integration.en.md).

Includes status, action timelines, exact timestamps/outcomes/duration, existing
logging/Loguru adapters, CPU/RSS history, launch profiles and process controls,
bounded restarts, Russian/English UI, onboarding and configurable retention.
The base dependency is psutil. Use `[aiogram]` only if aiogram is not already installed.
The browser UI and local fonts are bundled in the Python package.

[Downloads](https://github.com/olegoleg1111121/telegram-bot-control/releases/tag/v0.6.1)
· [Source development setup](https://github.com/olegoleg1111121/telegram-bot-control/blob/main/docs/development.en.md).

Early preview for one trusted owner. History starts at SDK integration. Bots sharing
one Python process share resources and cannot stop independently. Desktop Python is installed
separately. The Windows installer is currently unsigned.

Created by [Дмитрий Варг](https://github.com/olegoleg1111121). MIT license.
