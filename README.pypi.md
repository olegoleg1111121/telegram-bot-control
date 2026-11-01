# Telegram Bot Control

[Русский](#русский) · [English](#english)

## Русский

Панель мониторинга и управления существующими aiogram-ботами на Windows/Linux.
Для готовой программы достаточно **Python 3.11+**. Node.js, pnpm, Git и сборка исходников не нужны.
Используйте обычный Python, которым уже запускаете бота.

### Установка и запуск

```sh
python -m pip install --upgrade telegram-bot-control
tgbots
```

**Панель сама откроется в браузере.** Python, стандартная папка данных и локальный
вход определяются автоматически. Оставьте терминал открытым; `Ctrl+C` остановит
панель, а боты продолжат работать.

Если `tgbots` не найден, выполните **`python -m telegram_bot_control`**.
На Linux используйте `python3`; на Windows также можно использовать `py`.
Нужен Python 3.11+. Node.js, pnpm и отдельный установщик для этого способа не нужны.

[Отдельное desktop-окно Windows — дополнительный вариант](https://github.com/olegoleg1111121/telegram-bot-control/releases/tag/v0.8.0).
В нём есть автоматический поиск Python и окно ошибки с конкретным способом исправления.
[Termux и доступ из сети](https://github.com/olegoleg1111121/telegram-bot-control/blob/main/docs/web-panel.ru.md).

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

Desktop-версия 0.8.0+ обновляется через GitHub Releases: проверка и загрузка в фоне,
затем «Установить и перезапустить». Для 0.7.0 и старше один раз установите новый .exe.
Боты продолжают работать. ZIP-сборки обновляются вручную; Linux — через AppImage.
Python-пакет обновляйте командой `python -m pip install --upgrade telegram-bot-control`.

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

[Все готовые сборки](https://github.com/olegoleg1111121/telegram-bot-control/releases/tag/v0.8.0)
· [События и аналитика](https://github.com/olegoleg1111121/telegram-bot-control/blob/main/docs/actions.ru.md)
· [Разработка из исходников](https://github.com/olegoleg1111121/telegram-bot-control/blob/main/docs/development.ru.md).

---

## English

Monitor and control existing aiogram bots on Windows/Linux. **Python 3.11+** is enough
for the ready-made application; Node.js, pnpm and a source build are not required.
Use the same Python that already runs your bot.

### Install and launch

```sh
python -m pip install --upgrade telegram-bot-control
tgbots
```

The bundled dashboard opens in your browser and signs in locally. It uses the launching
Python and the owner's default directory without manual configuration. Keep the terminal
open; Ctrl+C stops the dashboard. If `tgbots` is not on PATH, use
**`python -m telegram_bot_control`**. Use `python3` on Linux or `py` on Windows as needed.

The [optional desktop application](https://github.com/olegoleg1111121/telegram-bot-control/releases/tag/v0.8.0)
includes automatic Python discovery, SDK checks and actionable connection error dialogs.
Installed Windows apps and Linux AppImages also receive GitHub updates, with background
downloads and an Install and restart button. Versions 0.7.0 and older need one manual
upgrade; extracted ZIP builds update manually. The Python package is updated with pip.

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

[Downloads](https://github.com/olegoleg1111121/telegram-bot-control/releases/tag/v0.8.0)
· [Source development setup](https://github.com/olegoleg1111121/telegram-bot-control/blob/main/docs/development.en.md).

Early preview for one trusted owner. History starts at SDK integration. Bots sharing
one Python process share resources and cannot stop independently. Desktop Python is installed
separately. The Windows installer is currently unsigned.

Created by [Дмитрий Варг](https://github.com/olegoleg1111121). MIT license.
