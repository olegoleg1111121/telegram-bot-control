# Публикация библиотеки в PyPI

GitHub и PyPI используют разные аккаунты. На PyPI нужны подтверждённая почта и
[двухфакторная аутентификация](https://docs.pypi.org/your-account/two-factor-authentication/).
Пароли, коды 2FA и API-токены не нужно добавлять в исходники или GitHub Secrets.

Подготовлен workflow `.github/workflows/publish-pypi.yml`: сборка пакета из выбранного
Git-тега, проверка исходников и тестов, сборка встроенного веб-интерфейса и публикация
wheel/sdist через Trusted Publishing. Публикация запускается явно; обычный push
в main не загружает новую версию на PyPI.

## Одноразовая настройка владельцем

1. Войти в [PyPI](https://pypi.org/account/login/) или создать аккаунт, подтвердить
   email и настроить 2FA. Эти действия выполняет владелец аккаунта.
2. Открыть [Publishing](https://pypi.org/manage/account/publishing/) и добавить
   pending publisher для GitHub:

   | Поле | Значение |
   | --- | --- |
   | PyPI project name | `telegram-bot-control` |
   | GitHub owner | `olegoleg1111121` |
   | GitHub repository | `telegram-bot-control` |
   | Workflow filename | `publish-pypi.yml` |
   | Environment name | `pypi` |

3. В GitHub создать environment `pypi` для этого репозитория. Если добавить
   обязательного reviewer, publish job будет ожидать его подтверждения.
4. В Actions открыть **Publish Python package to PyPI**, нажать Run workflow
   и выбрать существующий тег `v0.5.1`. После успешного publish проверить страницу
   проекта и установку в чистое окружение.

Pending publisher не резервирует имя: проект появляется при первом успешном upload.
[Официальная инструкция](https://docs.pypi.org/trusted-publishers/creating-a-project-through-oidc/).
Разрешение OIDC ограничено publish job; checkout и тестам оно не выдаётся.

## Команды установки

После успешной публикации в PyPI:

```sh
python -m pip install "telegram-bot-control[aiogram]"
```

Для панели/bridge, когда aiogram уже находится в окружениях ботов:

```sh
python -m pip install telegram-bot-control
tgbots web --port 8765 --data-dir /srv/bot-control/data
```

До публикации в PyPI можно установить wheel опубликованного GitHub Release:

```sh
python -m pip install "telegram-bot-control[aiogram] @ https://github.com/olegoleg1111121/telegram-bot-control/releases/download/v0.5.1/telegram_bot_control-0.5.1-py3-none-any.whl"
```

Wheel включает веб-интерфейс, поэтому сборка Node.js на сервере пользователя не
нужна. Git не содержит сгенерированный веб-интерфейс: для него перед `python -m build`
требуется `pnpm --dir desktop run build`.

## Следующая версия

Обновить Python/module/desktop версии вместе, changelog и release notes, создать
новый тег и дождаться CI. Затем запустить workflow для нового тега. Уже загруженные
файлы той же версии PyPI заменить не позволяет; для изменений нужна новая версия.
