export const guideRu = {
  label: 'ПЕРВОЕ ЗНАКОМСТВО',
  title: 'Ваши боты под контролем',
  subtitle: 'Подключим сервер и первого бота. Токен Telegram остаётся у бота.',
  steps: ['Знакомство', 'Подключение', 'Интеграция', 'Проверка', 'Готово'],
  language: 'Язык обучения',
  next: 'Далее',
  back: 'Назад',
  later: 'Пройти позже',
  finish: 'Открыть панель',
  close: 'Закрыть обучение',
  welcome: 'Один сервер. Все ваши боты.',
  welcomeBody:
    'Приложение показывает состояние, общую статистику и ошибки aiogram-ботов. Настройка выполняется один раз; обучение можно открыть снова из бокового меню или трея.',
  featureStatus: 'Состояние',
  featureStatusBody: 'Кто работает, остановлен или потерял связь.',
  featureActivity: 'Активность',
  featureActivityBody: 'Пользователи, сообщения, команды и нажатия.',
  featureControl: 'Управление',
  featureControlBody: 'Запуск, штатная остановка и перезапуск.',
  connectionTitle: 'Где работают ваши боты?',
  webConnection:
    'Это веб-панель вашего сервера. Python и общая папка уже заданы командой tgbots web. Ниже показана серверная папка для интеграции ботов.',
  webFinish:
    'Закрытие вкладки не останавливает веб-сервер и ботов. Кнопка «Выйти» завершает сеанс браузера. Сам сервер выключается в терминале или в настольных настройках веб-доступа.',
  connectionBody:
    'Для этого компьютера выберите «Локально»: Python найдётся автоматически. Обычно папку статистики можно оставить пустой. SSH нужен для подключения к другому серверу.',
  connectionPython:
    'Для готового приложения нужен Python 3.11+ с пакетом telegram-bot-control. Если бот уже работает через python, используйте его. Node.js и pnpm для установки программы не нужны.',
  connectionOk: 'Подключение проверено. Настройки сохранены.',
  connectionIdle:
    'Нажмите «Подключиться», чтобы проверить Python и доступ к папке. Можно продолжить обучение и настроить подключение позже.',
  installTitle: 'Подключите библиотеку к боту',
  installBody:
    'Откройте PowerShell или терминал на сервере бота и выполните команду ниже. Если ваш бот запускается через py или python3, замените python тем же способом. Существующие .env, логгер и роутеры менять не нужно.',
  installLabel: 'В терминале, используя Python вашего бота',
  installCommand: 'python -m pip install --upgrade telegram-bot-control',
  codeLabel: 'Внутри main(), после создания bot и dp',
  codeBody:
    'Добавьте этот фрагмент перед существующим await dp.start_polling(bot). Не создавайте второй Bot или Dispatcher и не дублируйте start_polling().',
  sameDirectory:
    'Папка данных должна совпадать с выбранной на предыдущем шаге. Если поле пустое, используется папка владельца по умолчанию.',
  copy: 'Копировать',
  copied: 'Скопировано',
  copyError: 'Не удалось скопировать. Выделите текст вручную.',
  verifyTitle: 'Первый запуск — привычной командой',
  verifyBody:
    'Сохраните главный файл и один раз запустите бота своим обычным способом. Регистрация начнётся при startup aiogram; бот автоматически появится в списке. Произвольные файлы на сервере приложение не сканирует.',
  registered: 'Ботов в выбранной папке',
  registeredBody:
    'Регистрация уже есть. Если бот сейчас остановлен, его сохранённая история остаётся в списке. Продолжите обучение, чтобы узнать об управлении процессами.',
  empty: 'Пока ни одного бота',
  emptyBody:
    'Это нормально до первого запуска с библиотекой. Если бот уже работает, проверьте папку данных и подключение middleware.',
  refresh: 'Проверить снова',
  verifyConnection:
    'Сначала проверьте подключение на шаге 2. Обучение можно завершить и без подключённого бота.',
  history:
    'История начинается с подключения библиотеки. Тексты сообщений и исходные Telegram updates не сохраняются.',
  readyTitle: 'Теперь можно открыть панель',
  controls:
    'Выберите бота слева: в карточке будут «Запустить», «Остановить», «Перезапустить». Для скриптов и дополнительных команд проверьте «Настроить запуск»: команду, рабочую папку, подготовку и env-файл.',
  tray: 'Крестик прячет окно в трей. Нажмите на значок или снова запустите приложение, чтобы вернуть окно. Для полного выхода выберите «Выйти из приложения» в меню трея. Боты продолжат работать.',
  trayUnavailable:
    'В этом окружении системный трей недоступен: крестик закроет приложение. Самостоятельно запущенные боты продолжат работать.',
  settings:
    'В настройках меняются язык, часовой пояс и сроки хранения. Сокращение истории требует подтверждения. Автозапуск ботов после перезагрузки сервера настраивается отдельно.',
  reopen: 'Вернуться к обучению можно в любой момент через пункт «Обучение и подключение».',
};
type GuideTranslation = { [K in keyof typeof guideRu]: K extends 'steps' ? string[] : string };
export const guideEn: GuideTranslation = {
  label: 'GETTING STARTED',
  title: 'Your bots, under control',
  subtitle: 'Connect your server and first bot. The Telegram token stays with the bot.',
  steps: ['Welcome', 'Connection', 'Integration', 'Check', 'Ready'],
  language: 'Guide language',
  next: 'Next',
  back: 'Back',
  later: 'Do this later',
  finish: 'Open dashboard',
  close: 'Close guide',
  welcome: 'One server. All your bots.',
  welcomeBody:
    'Monitor the state, aggregate activity and errors of your aiogram bots. Set up once and reopen this guide from the sidebar or system tray whenever you need it.',
  featureStatus: 'State',
  featureStatusBody: 'See which bots are running, stopped or out of contact.',
  featureActivity: 'Activity',
  featureActivityBody: 'Users, messages, commands and button events.',
  featureControl: 'Control',
  featureControlBody: 'Start, gracefully stop and restart bot processes.',
  connectionTitle: 'Where do your bots run?',
  webConnection:
    'This is your server web dashboard. The tgbots web command already selects Python and the shared directory. Use the server directory below to integrate bots.',
  webFinish:
    'Closing this tab keeps the server and bots running. Sign out ends this browser session. Stop the server in its terminal or in desktop web-access settings.',
  connectionBody:
    'Choose Local for this computer: Python is discovered automatically. The statistics directory can usually remain empty. Use SSH to connect to another server.',
  connectionPython:
    'The ready-made app requires Python 3.11+ with telegram-bot-control. Use the Python that already runs your bot. Node.js and pnpm are not needed to install the application.',
  connectionOk: 'Connection verified. Settings saved.',
  connectionIdle:
    'Press Connect to check Python and the data directory. You may continue the guide and configure the connection later.',
  installTitle: 'Connect the SDK to your bot',
  installBody:
    'Open PowerShell or the terminal on your bot server and run the command below. If your bot uses py or python3, use that instead of python. Keep existing .env, logging and routers.',
  installLabel: 'In a terminal, using your bot’s Python',
  installCommand: 'python -m pip install --upgrade telegram-bot-control',
  codeLabel: 'Inside main(), after creating bot and dp',
  codeBody:
    'Insert this before your existing await dp.start_polling(bot). Keep your existing Bot and Dispatcher and do not add a second start_polling() call.',
  sameDirectory:
    'Use the same data directory as on the previous step. Leaving it empty uses the current owner’s default state directory.',
  copy: 'Copy',
  copied: 'Copied',
  copyError: 'Could not copy. Select the text manually.',
  verifyTitle: 'Start your bot the usual way once',
  verifyBody:
    'Save the main file and run your usual launch command. Registration begins at aiogram startup and the bot appears automatically. The application does not scan arbitrary server files.',
  registered: 'Bots in the selected directory',
  registeredBody:
    'Registration is available. A stopped bot stays in the list with its saved history. Continue to learn about process control.',
  empty: 'No bots yet',
  emptyBody:
    'This is expected before the first SDK-enabled startup. If your bot is running, check the data directory and middleware integration.',
  refresh: 'Check again',
  verifyConnection:
    'Check your connection in step 2 first. You can finish this guide without a connected bot.',
  history:
    'History starts when the SDK is connected. Message bodies and raw Telegram updates are not recorded.',
  readyTitle: 'You are ready to explore',
  controls:
    'Select a bot on the left to Start, Stop or Restart it. For scripts and additional commands, review Configure launch: command, working directory, preparation and environment file.',
  tray: 'The close button hides the window in the system tray. Click its icon or launch the application again to restore it. Choose Quit application in the tray menu to exit. Your bots keep running.',
  trayUnavailable:
    'The system tray is unavailable here: closing the window will exit the dashboard. Independently running bots keep working.',
  settings:
    'Settings include language, time zone and retention periods. Shortening history requires confirmation. Configure server reboot autostart separately.',
  reopen: 'Open Getting started again at any time from the sidebar or tray menu.',
};
