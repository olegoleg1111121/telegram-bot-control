# Обновления desktop / Desktop updates

## Русский

Начиная с **0.8.0**, установленная Windows-версия и Linux AppImage получают новые
сборки из [официальных GitHub Releases](https://github.com/olegoleg1111121/telegram-bot-control/releases).
Аккаунт GitHub, токен, Node.js и pnpm на компьютере пользователя не нужны.

1. При запуске (через 15 секунд) и каждые 6 часов панель проверяет новые версии.
2. По умолчанию обновление загружается в фоне. Прогресс виден в настройках.
3. Когда загрузка завершена, в панели появляется **Установить и перезапустить**.
   При скрытом окне также приходит системное уведомление, если ОС его разрешает.
4. Нажмите эту кнопку: обновится и перезапустится только панель. Процессы ботов,
   подключение, история и настройки сохраняются. Python SDK автоматически не меняется.

**Настройки → Обновления приложения:** ручная проверка, отключение фоновой проверки
и загрузки, выбор предварительных версий. Сейчас проект выпускается как prerelease,
поэтому их получение включено по умолчанию. Незавершённые draft-релизы недоступны.
Понижение версии отключено. Скачанная сборка не устанавливается при обычном закрытии
окна или выходе: установка начинается только по кнопке.

Для **0.7.0 и старше** нужен один ручной переход: скачайте новый Windows `.exe`
и установите его. В старых версиях нет кода, который мог бы получить автообновление.
Если вы использовали ZIP, откройте ярлык установленной версии. Распакованные ZIP-сборки
и запуск из исходников обновляются вручную. На Linux запускайте сам файл AppImage,
к которому у текущего пользователя есть доступ на запись.

При ошибке ручной проверки открывается окно с подробностями; при фоновой проверке
ошибка видна в настройках и не прерывает работу. Можно повторить проверку позднее.
Проверка и загрузка требуют доступа к GitHub и его доменам выдачи файлов.

Обновления передаются по HTTPS; `electron-updater` проверяет SHA-512 загруженной сборки
по метаданным релиза. Windows-установщики пока не подписаны Authenticode, поэтому
криптографическая проверка издателя отсутствует. Публикацию контролирует доступ к репозиторию.

Браузерная панель и Python-библиотека обновляются отдельно:

```sh
python -m pip install --upgrade telegram-bot-control
```

Выполняйте команду тем Python, которым запускаете панель или конкретного бота.
Для применения новой версии SDK перезапустите соответствующего бота в удобное время.

## English

From **0.8.0**, installed Windows NSIS apps and Linux AppImages check the official
GitHub Releases repository 15 seconds after startup and every six hours. Automatic
checking/downloading and prereleases are enabled by default and can be changed in
Settings → Application updates. No GitHub account or token is needed. Draft releases
are invisible and downgrades are disabled.

Downloads happen in the background. Click **Install and restart** when ready; normal
close/quit does not install anything. Bot processes, profiles and history are preserved.
The Python SDK is not updated by the desktop updater. An offline check can be retried;
manual failures open a modal while background failures stay in Settings.

Versions 0.7.0 and older need one manual installation of the new Windows `.exe`.
Extracted ZIP and source builds update manually. On Linux run a writable AppImage.
HTTPS and release SHA-512 checks protect transfer integrity; Windows binaries currently
have no Authenticode publisher signature. Repository access controls release publication.

Update the browser dashboard/Python SDK separately with
`python -m pip install --upgrade telegram-bot-control`, using the intended interpreter.
Restart a bot when convenient to load a new SDK version.

## Release maintenance

The tag workflow builds NSIS/AppImage artifacts with a fixed GitHub publish provider,
verifies each manifest against the artifact SHA-512, and uploads `latest.yml`,
`latest-linux.yml`, installer `.blockmap`, binaries and SHA256SUMS into the draft release.
Publish only after CI and release checks pass. Keep older release artifacts for
differential downloads. Prereleases are discovered through the public releases feed;
disabling prereleases selects GitHub's latest stable release.

The app uses `electron-updater` 6.8.11 with its standard hash/signature verification.
No custom feed URL or verification override is exposed through renderer IPC. Packaging
configuration fixes the repository, preserves the app ID, and includes production
dependencies. Signing a future Windows build enables the upstream publisher check;
keep the signing identity consistent across later releases.
