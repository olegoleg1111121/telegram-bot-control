const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  clipboard,
  shell,
  dialog,
  Notification,
} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { BridgeClient, commandFor } = require('./bridge-client.cjs');
const { preferences, connectionProfile, defaultPython } = require('./desktop-state.cjs');
const { createLifecycle } = require('./window-lifecycle.cjs');
const { createUpdates, updateMode, RELEASES } = require('./updates.cjs');
const {
  discoverPythons,
  probePython,
  installationCommand,
  validateDataDirectory,
  alias,
} = require('./python-discovery.cjs');

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
let updates;
let connectionAttempt = 0;
let pythonDiscovery;
let discoveryTime = 0;
function findPythons(force = false) {
  if (!pythonDiscovery || force || Date.now() - discoveryTime > 60000) {
    discoveryTime = Date.now();
    pythonDiscovery = discoverPythons({
      root,
      preferred: [profile?.python, defaultPython(root, process.platform, process.env)],
    });
  }
  return pythonDiscovery;
}
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
  if (next.mode === 'local') {
    validateDataDirectory(next.dataDir);
    let python;
    if (alias(next.python || 'python')) {
      const found = await findPythons();
      const chosen = found.candidates.find((item) => item.executable === found.recommended);
      python = chosen ? await probePython(chosen.executable, { platform: process.platform }) : null;
    } else python = await probePython(next.python, { platform: process.platform });
    if (!python)
      throw Object.assign(new Error('No working Python found'), { code: 'python_missing' });
    if (!python.compatible)
      throw Object.assign(new Error(`Python ${python.version}`), {
        code: 'python_unsupported',
        python: python.executable,
      });
    if (!python.sdk)
      throw Object.assign(new Error('SDK is not installed in this Python'), {
        code: 'sdk_missing',
        python: python.executable,
        installCommand: installationCommand(python.executable, process.platform, python.pip),
      });
    next = { ...next, python: python.executable };
  }
  if (attempt !== connectionAttempt) throw new Error('Connection attempt superseded');
  const candidate = new BridgeClient(next);
  candidate.on('disconnected', () => {});
  try {
    const hello = await candidate.request('hello');
    await candidate.request('snapshot', { since: Date.now() / 1000 - 1 });
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
    updates = createUpdates({
      updater: experienceSmoke
        ? require('./updates-smoke.cjs').fixture(app)
        : require('electron-updater').autoUpdater,
      version: app.getVersion(),
      mode: experienceSmoke
        ? 'automatic'
        : updateMode({
            packaged: app.isPackaged && !smoke,
            platform: process.platform,
            executable: app.getPath('exe'),
            appImage: process.env.APPIMAGE,
          }),
      preferences: desktopState,
      changed: (state) => {
        if (!window.isDestroyed()) window.webContents.send('updates:changed', state);
      },
      notify: (version) => {
        if (!Notification.isSupported() || window.isFocused()) return;
        const ru = desktopState.read().language !== 'en';
        const notification = new Notification({
          title: 'Telegram Bot Control',
          body: ru
            ? `Версия ${version} готова. Откройте панель, чтобы установить обновление.`
            : `Version ${version} is ready. Open the dashboard to install the update.`,
        });
        notification.on('click', () => lifecycle?.restore());
        notification.show();
      },
    });
    handle('updates:status', () => updates.read());
    handle('updates:check', () => updates.check());
    handle('updates:download', () => updates.download());
    handle('updates:install', () => updates.install());
    handle('updates:preferences', (next) => updates.configure(next));
    handle('updates:releases', () => shell.openExternal(RELEASES));
    handle('control:snapshot', (params) => request('snapshot', params));
    handle('control:connection', () => profile);
    handle('control:discover-python', (force) => findPythons(force === true));
    handle('control:choose-path', async (kind) => {
      if (!['python', 'directory'].includes(kind)) throw new Error('Invalid picker');
      const result = await dialog.showOpenDialog(window, {
        properties: [kind === 'python' ? 'openFile' : 'openDirectory'],
        ...(kind === 'python' && process.platform === 'win32'
          ? { filters: [{ name: 'Python', extensions: ['exe'] }] }
          : {}),
      });
      return result.canceled ? '' : result.filePaths[0] || '';
    });
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
      try {
        const result = await connect(next);
        fs.mkdirSync(app.getPath('userData'), { recursive: true });
        fs.writeFileSync(
          path.join(app.getPath('userData'), 'connection.json'),
          JSON.stringify(profile),
          { mode: 0o600 },
        );
        return { ok: true, profile, hello: result };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: error.code || (next?.mode === 'ssh' ? 'ssh_failed' : 'bridge_failed'),
            details: String(error.message || error).slice(0, 3000),
            python: error.python || '',
            installCommand: error.installCommand || '',
          },
        };
      }
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
      updates.start();
    }
  });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  updates?.dispose();
  if (client) client.close();
});
