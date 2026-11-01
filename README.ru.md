# Telegram Bot Control

[Русский](README.md) · [English](README.en.md)

Панель состояния, статистики, логов и управления вашими aiogram-ботами.
Один владелец, один Windows/Linux-сервер, сколько угодно подключённых ботов.

## Установка на Windows

**Для готовой программы достаточно Python 3.11+. Node.js, pnpm и Git устанавливать не нужно.**
Если ваш бот уже запускается через `python main.py`, используйте этот же Python.

1. Откройте PowerShell и установите библиотеку:

   ```powershell
   python -m pip install --upgrade telegram-bot-control
   ```

2. [Скачайте установщик Windows](https://github.com/olegoleg1111121/telegram-bot-control/releases/download/v0.6.1/Telegram-Bot-Control-0.6.1-win-x64.exe).
   Запустите скачанный `.exe` и завершите установку.
3. Откройте **Telegram Bot Control** ярлыком на рабочем столе или из «Пуска».
   В обучении выберите **Локально**, в поле Python укажите `python` и нажмите **Подключиться**.

Если команда `python` не найдена, [установите Python для Windows](https://www.python.org/downloads/windows/)
с доступом из терминала и заново откройте PowerShell. Проверьте `python --version`.
Если бота вы запускаете через `py main.py`, в команде установки используйте
`py -m pip install --upgrade telegram-bot-control`.

[Подробно: установка и подключение первого бота](docs/getting-started.ru.md).
[Все сборки: Windows portable и Linux AppImage](https://github.com/olegoleg1111121/telegram-bot-control/releases/tag/v0.6.1).

## Самый короткий вариант — панель в браузере

Работает без отдельного приложения. На Windows в PowerShell:

```powershell
python -m pip install --upgrade telegram-bot-control
python -m telegram_bot_control web --port 8765
```

На Linux используйте `python3` вместо `python` в обеих командах.
Откройте **http://127.0.0.1:8765** в браузере и введите ключ, показанный в терминале.
Оставьте терминал открытым. `Ctrl+C` остановит панель; сами боты продолжат работать.
[Termux и доступ с другого устройства](docs/web-panel.ru.md).

## Как добавить своего бота

После создания существующих `bot` и `dp`, перед запуском polling, добавьте:

```python
from telegram_bot_control import start

monitor = start(bot=bot, dispatcher=dp, capture_logs=True)
dp.update.outer_middleware(monitor.middleware())
```

Сохраните файл и запустите бота **своей обычной командой**. После его запуска
карточка появится в панели автоматически. Существующие `.env`, логгер и роутеры остаются.
В панели также есть кнопка **Подключить бота** с мастером настройки.

По умолчанию бот и панель используют общую папку данных текущего пользователя.
Если задаёте `data_dir` вручную, укажите одинаковый путь в коде бота и в панели.
Для webhook и сложной структуры проекта есть [подробная инструкция](docs/getting-started.ru.md).

**Работаете с ИИ?** [Скопируйте готовый промпт для подключения](docs/ai-integration.ru.md)
или откройте **Подключить с ИИ** в панели.

## Возможности

- Состояние ботов, пользователи, сообщения, команды и нажатия кнопок.
- Свои события и функции: `monitor.track_action()` и `@monitor.action()`,
  графики и история с точным временем, результатом и длительностью.
- Существующие logging/Loguru, поиск по логам и подробности ошибок запуска.
- CPU, память RSS и потоки процесса каждого бота.
- Запуск, остановка, перезапуск, подготовительные команды и ограниченный автоперезапуск.
- Русский/английский интерфейс, обучение при первом запуске, трей и настройка истории.

![Обзор панели с демонстрационными данными](docs/assets/overview.png)

## Попробовать без своего бота

В первом терминале:

```sh
python -m pip install "telegram-bot-control[aiogram]"
python -m telegram_bot_control demo --bots 3
```

Во втором терминале:

```sh
python -m telegram_bot_control web --port 8765
```

Откройте показанный адрес и введите ключ панели. Это синтетические события;
Telegram-токен не нужен. На Linux в командах замените `python` на `python3`.

## Документация

[Первый запуск](docs/getting-started.ru.md) · [Готовый промпт для ИИ](docs/ai-integration.ru.md)
· [События и графики](docs/actions.ru.md) · [Логи и ресурсы](docs/diagnostics.ru.md)
· [Профили запуска](docs/process-control.md) · [Веб/Termux](docs/web-panel.ru.md)
· [Схема связи](docs/transport.md) · [Изменения версий](CHANGELOG.md).

**Хотите менять исходники?** [Отдельная инструкция для разработчика](docs/development.ru.md)
объясняет, где скачать Node.js и как установить pnpm. Для использования готовой программы
эту инструкцию выполнять не требуется.

Ранняя версия для одного доверенного владельца. История начинается после подключения SDK.
Боты в одном Python-процессе делят его ресурсы и не могут останавливаться независимо.
Python устанавливается отдельно от desktop-приложения. Подпись установщика пока не настроена.

Автор: [Дмитрий Варг](https://github.com/olegoleg1111121). [Лицензия MIT](LICENSE).
