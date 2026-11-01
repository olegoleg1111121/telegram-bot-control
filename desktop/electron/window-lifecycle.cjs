const { Tray, Menu } = require('electron');
const path = require('node:path');

function createLifecycle(app, window, { assets, language = 'ru', openGuide, quiet = false }) {
  let quitting = false;
  let tray = null;
  let menu = null;
  let shownHint = false;
  const restore = () => {
    if (window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.setSkipTaskbar(false);
    window.show();
    window.focus();
  };
  const text = () =>
    language === 'en'
      ? {
          show: 'Open Telegram Bot Control',
          guide: 'Getting started',
          quit: 'Quit application',
          hidden:
            'The window is in the system tray. Click the icon to reopen it. Your bots keep running.',
        }
      : {
          show: 'Открыть Telegram Bot Control',
          guide: 'Обучение и подключение',
          quit: 'Выйти из приложения',
          hidden:
            'Окно скрыто в трее. Нажмите на значок, чтобы открыть его снова. Боты продолжают работать.',
        };
  const updateMenu = () => {
    if (!tray) return;
    const t = text();
    menu = Menu.buildFromTemplate([
      { id: 'show', label: t.show, click: restore },
      {
        id: 'guide',
        label: t.guide,
        click: () => {
          restore();
          openGuide();
        },
      },
      { type: 'separator' },
      { id: 'quit', label: t.quit, click: () => app.quit() },
    ]);
    tray.setContextMenu(menu);
  };
  try {
    tray = new Tray(path.join(assets, process.platform === 'win32' ? 'icon.ico' : 'icon.png'));
    tray.setToolTip('Telegram Bot Control');
    tray.on('click', restore);
    tray.on('double-click', restore);
    tray.on('balloon-click', restore);
    updateMenu();
  } catch (error) {
    console.error('System tray is unavailable:', error.message);
    tray?.destroy();
    tray = null;
  }
  window.on('close', (event) => {
    if (quitting || !tray || tray.isDestroyed()) return;
    event.preventDefault();
    window.hide();
    window.setSkipTaskbar(true);
    if (!shownHint && !quiet && process.platform === 'win32') {
      shownHint = true;
      tray.displayBalloon({
        title: 'Telegram Bot Control',
        content: text().hidden,
        iconType: 'info',
      });
    }
  });
  window.on('query-session-end', () => {
    quitting = true;
  });
  app.on('before-quit', () => {
    quitting = true;
  });
  app.on('activate', restore);
  app.on('second-instance', restore);
  app.on('will-quit', () => {
    tray?.destroy();
  });
  return {
    restore,
    get tray() {
      return tray;
    },
    get menu() {
      return menu;
    },
    setLanguage(next) {
      language = next;
      updateMenu();
    },
  };
}

module.exports = { createLifecycle };
