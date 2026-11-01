const { app, BrowserWindow, ipcMain, Menu, clipboard, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { BridgeClient, commandFor } = require('./bridge-client.cjs');
const { preferences, connectionProfile, defaultPython } = require('./desktop-state.cjs');
const { createLifecycle } = require('./window-lifecycle.cjs');

const root = path.resolve(__dirname, '../..');
const portfolio = process.argv.includes('--portfolio');
const controlSmoke = process.argv.includes('--control-smoke');
const experienceSmoke = process.argv.includes('--experience-smoke');
const experienceSecond = process.argv.includes('--experience-second');
const smoke =
  process.argv.includes('--smoke-test') ||
  controlSmoke ||
  portfolio ||
  experienceSmoke ||
  experienceSecond;
if (smoke) {
  app.disableHardwareAcceleration();
  app.setPath(
    'userData',
    path.join(
      root,
      experienceSmoke || experienceSecond
        ? '.test-data/electron-experience-smoke'
        : portfolio
          ? '.test-data/electron-portfolio'
          : controlSmoke
            ? '.test-data/electron-control-smoke'
            : '.test-data/electron-smoke',
    ),
  );
}
let window;
let client;
let profile;
let connecting;
let desktopState;
let lifecycle;
let connectionAttempt = 0;
const primary =
  smoke && !experienceSmoke && !experienceSecond ? true : app.requestSingleInstanceLock();
if (!primary) app.quit();

function defaultProfile() {
  return {
    mode: 'local',
    python: defaultPython(root, process.platform, process.env),
    dataDir: process.env.BOTCONTROL_HOME || '',
    host: '',
    user: '',
    port: 22,
    keyPath: '',
  };
}
async function connect(next) {
  commandFor(next); // Validate before disturbing a working connection.
  const attempt = ++connectionAttempt;
  const candidate = new BridgeClient(next);
  candidate.on('disconnected', () => {});
  try {
    const hello = await candidate.request('hello');
    if (attempt !== connectionAttempt) throw new Error('Connection attempt superseded');
    const previous = client;
    client = candidate;
    profile = { ...next };
    previous?.close();
    return hello;
  } catch (error) {
    candidate.close();
    throw error;
  }
}
async function request(method, params) {
  if (!client) {
    if (!connecting)
      connecting = connect(profile).finally(() => {
        connecting = null;
      });
    await connecting;
  }
  const active = client;
  try {
    return await active.request(method, params);
  } catch (error) {
    if (!error.remote && client === active) {
      active.close();
      client = null;
    }
    throw error;
  }
}

if (primary)
  app.whenReady().then(async () => {
    if (experienceSecond) {
      app.exit(11);
      return;
    }
    Menu.setApplicationMenu(null);
    app.setAppUserModelId('dev.telegram-bot-control.desktop');
    desktopState = preferences(app.getPath('userData'));
    if (experienceSmoke) desktopState.update({ guideSeenVersion: 0, language: 'ru' });
    let savedProfile = {};
    if (!smoke && process.env.BOTCONTROL_FORCE_LOCAL !== '1') {
      try {
        savedProfile = JSON.parse(
          fs.readFileSync(path.join(app.getPath('userData'), 'connection.json'), 'utf8'),
        );
      } catch {}
    }
    profile = connectionProfile(defaultProfile(), savedProfile, process.env);
    window = new BrowserWindow({
      width: 1420,
      height: 930,
      minWidth: 1080,
      minHeight: 720,
      title: 'Telegram Bot Control',
      backgroundColor: '#0b0e14',
      show: false,
      icon: path.join(__dirname, '../assets/icon.png'),
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: !smoke,
      },
    });
    if (!smoke || experienceSmoke)
      lifecycle = createLifecycle(app, window, {
        assets: path.join(__dirname, '../assets'),
        language: desktopState.read().language,
        quiet: smoke,
        openGuide: () => window.webContents.send('desktop:open-guide'),
      });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    const handle = (name, handler) =>
      ipcMain.handle(name, (event, ...args) => {
        if (
          event.sender !== window.webContents ||
          event.senderFrame !== window.webContents.mainFrame
        )
          throw new Error('Untrusted sender');
        return handler(...args);
      });
    handle('control:snapshot', (params) => request('snapshot', params));
    handle('control:connection', () => profile);
    handle('web:status', () => request('web_status', {}));
    handle('web:start', (options) => request('web_start', options));
    handle('web:stop', () => request('web_stop', {}));
    handle('web:open', async () => {
      const info = await request('web_status', {});
      if (!info.running) throw new Error('Web dashboard is stopped');
      const host = profile.mode === 'ssh' ? profile.host : '127.0.0.1';
      if (profile.mode === 'ssh' && info.host === '127.0.0.1')
        throw new Error('Use an SSH tunnel for remote loopback access');
      const url = new URL(`http://${host.includes(':') ? '[' + host + ']' : host}:${info.port}`);
      await shell.openExternal(url.href);
    });
    handle('desktop:info', () => ({
      ...desktopState.read(),
      trayAvailable: !!lifecycle?.tray,
      runtime: 'desktop',
      version: app.getVersion(),
      autoGuide: !smoke || experienceSmoke,
    }));
    handle('desktop:preferences', (next) => {
      const prefs = desktopState.update(next);
      if (prefs.language) lifecycle?.setLanguage(prefs.language);
      return prefs;
    });
    handle('desktop:copy', (text) => {
      if (typeof text !== 'string' || text.length > 20000)
        throw new Error('Invalid clipboard text');
      clipboard.writeText(text);
    });
    handle('control:connect', async (next) => {
      const result = await connect(next);
      fs.mkdirSync(app.getPath('userData'), { recursive: true });
      fs.writeFileSync(
        path.join(app.getPath('userData'), 'connection.json'),
        JSON.stringify(profile),
        { mode: 0o600 },
      );
      return result;
    });
    handle('control:preview-retention', (settings) => request('preview_retention', { settings }));
    handle('control:save-settings', (settings, confirmCleanup) =>
      request('save_settings', { settings, confirm_cleanup: confirmCleanup === true }),
    );
    handle('control:launch-profile', (botId) => request('launch_profile', { bot_id: botId }));
    handle('control:logs', (params) => request('logs', params));
    handle('control:actions', (params) => request('action_analytics', params));
    handle('control:inspect-project', (directory, entrypoint) =>
      request('inspect_project', { directory, entrypoint }),
    );
    handle('control:register-project', (params) => request('register_project', params));
    handle('control:save-launch-profile', (botId, launchProfile) =>
      request('save_launch_profile', { bot_id: botId, profile: launchProfile }),
    );
    handle('control:bot', (botId, action, force) =>
      request('control_bot', { bot_id: botId, action, force }),
    );
    await window.loadFile(path.join(__dirname, '../dist/index.html'));
    if (smoke) {
      try {
        await require(
          experienceSmoke
            ? './experience-smoke.cjs'
            : portfolio
              ? './portfolio.cjs'
              : controlSmoke
                ? './control-smoke.cjs'
                : './smoke.cjs',
        ).run(window, root, { app, lifecycle });
        if (experienceSmoke) return;
        app.exit(0);
      } catch (error) {
        console.error(error);
        app.exit(1);
      }
    } else {
      window.show();
    }
  });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  if (client) client.close();
});
