# Сборка из исходников — для разработчика

[Русский](development.ru.md) · [English](development.en.md)

Выполняйте это, если хотите менять код программы. Для использования готовой панели
откройте [обычную инструкцию установки](getting-started.ru.md).

## Что установить один раз

1. **Python 3.11+** — [официальные загрузки](https://www.python.org/downloads/).
   Можно использовать Python, который у вас уже установлен.
2. **Node.js 24.x** — [официальные сборки ветки 24](https://nodejs.org/download/release/latest-v24.x/).
   На Windows x64 выберите файл, оканчивающийся на `-x64.msi`, и установите его.
   После установки заново откройте терминал. Вместе с Node.js устанавливается npm.
3. **pnpm 11.25.0** — установите через npm командой ниже.
   Проект фиксирует эту версию в `desktop/package.json`.

В PowerShell можно явно вызывать `.cmd`, чтобы не зависеть от политики запуска `.ps1`:

```powershell
node --version
npm.cmd install --global pnpm@11.25.0
pnpm.cmd --version
```

На Linux вместо `npm.cmd` и `pnpm.cmd` используйте `npm` и `pnpm`.
[Официальная инструкция pnpm](https://pnpm.io/installation#using-npm).

## Получить исходники и собрать

Скачайте `telegram-bot-control-v…-source.zip` из
[GitHub Releases](https://github.com/olegoleg1111121/telegram-bot-control/releases)
и распакуйте его. Можно также клонировать репозиторий через Git.
Откройте терминал **в распакованной папке с `pyproject.toml` и папкой `desktop`**:

```powershell
python -m pip install -e ".[dev,release]"
pnpm.cmd install --dir desktop --frozen-lockfile
pnpm.cmd --dir desktop run build
python -m telegram_bot_control open
```

На Linux замените `python` на `python3`, а `pnpm.cmd` на `pnpm`.
`build` также подготавливает веб-файлы для Python-пакета.

Окружение для разработки выбираете вы. Инструкция не требует создавать новое:
если используете собственное изолированное окружение, выполняйте команды его Python.
Для фиксированного набора Python-зависимостей доступен `requirements-dev.lock`.

## Проверки и упаковка

```powershell
python -m pytest -q
python -m ruff check src scripts tests examples
pnpm.cmd --dir desktop run test
pnpm.cmd --dir desktop run format:check
pnpm.cmd --dir desktop run dist
```

Установщик появится в `desktop/release/`. Linux AppImage собирается на Linux.
Для wheel/sdist после сборки интерфейса выполните `python -m build`.
[Выпуск релиза](releasing.md) · [Публикация на PyPI](pypi.ru.md).
