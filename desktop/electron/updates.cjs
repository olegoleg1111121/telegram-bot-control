const fs = require('node:fs');
const path = require('node:path');

const RELEASES = 'https://github.com/olegoleg1111121/telegram-bot-control/releases';

function updateMode({ packaged, platform, executable, appImage, exists = fs.existsSync }) {
  if (!packaged) return 'development';
  if (platform === 'linux') return appImage ? 'automatic' : 'portable';
  if (platform === 'win32')
    return exists(path.join(path.dirname(executable), 'Uninstall Telegram Bot Control.exe'))
      ? 'automatic'
      : 'portable';
  return 'unsupported';
}

// No bot bridge or process-manager access: an update only replaces the desktop app.
function createUpdates({ updater, version, mode, preferences, changed, notify = () => {} }) {
  let checking = null;
  let downloading = null;
  let timer;
  let interval;
  let disposed = false;
  let state = {
    version,
    mode,
    phase: mode === 'automatic' ? 'idle' : 'unavailable',
    nextVersion: '',
    progress: 0,
    checkedAt: null,
    error: '',
  };
  const read = () => {
    const { autoUpdate, includePrereleases } = preferences.read();
    return { ...state, autoUpdate, includePrereleases };
  };
  const patch = (next) => {
    if (disposed) return;
    state = { ...state, ...next };
    changed(read());
  };
  const fail = (error) => {
    patch({ phase: 'error', error: String(error?.message || error).slice(0, 1500) });
  };
  const listeners = {
    'checking-for-update': () => patch({ phase: 'checking', error: '' }),
    'update-available': (info) =>
      patch({ phase: 'available', nextVersion: info.version, progress: 0, error: '' }),
    'update-not-available': () =>
      patch({ phase: 'current', nextVersion: '', error: '', checkedAt: Date.now() }),
    'download-progress': (info) =>
      patch({ phase: 'downloading', progress: Math.max(0, Math.min(100, info.percent || 0)) }),
    'update-downloaded': (info) => {
      patch({ phase: 'downloaded', nextVersion: info.version, progress: 100, error: '' });
      notify(info.version);
    },
    error: fail,
  };
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowDowngrade = false;
  updater.allowPrerelease = preferences.read().includePrereleases;
  updater.logger = null;
  Object.entries(listeners).forEach(([name, listener]) => updater.on(name, listener));

  function download() {
    if (disposed || mode !== 'automatic' || state.phase === 'downloaded')
      return Promise.resolve(read());
    if (downloading) return downloading.then(read);
    if (!state.nextVersion || !['available', 'error'].includes(state.phase))
      return Promise.resolve(read());
    patch({ phase: 'downloading', error: '', progress: 0 });
    downloading = Promise.resolve()
      .then(() => updater.downloadUpdate())
      .catch(fail)
      .finally(() => {
        downloading = null;
      });
    return downloading.then(read);
  }
  function check() {
    if (disposed || mode !== 'automatic' || ['downloaded', 'installing'].includes(state.phase))
      return Promise.resolve(read());
    if (checking) return checking.then(read);
    if (downloading) return downloading.then(read);
    patch({ phase: 'checking', error: '', nextVersion: '' });
    updater.allowPrerelease = preferences.read().includePrereleases;
    checking = Promise.resolve()
      .then(() => updater.checkForUpdates())
      .then(async () => {
        patch({ checkedAt: Date.now() });
        if (state.phase === 'available' && preferences.read().autoUpdate) await download();
      })
      .catch(fail)
      .finally(() => {
        checking = null;
      });
    return checking.then(read);
  }
  return {
    read,
    check,
    download,
    configure(next) {
      if (
        !next ||
        typeof next !== 'object' ||
        Object.entries(next).some(
          ([key, value]) =>
            !['autoUpdate', 'includePrereleases'].includes(key) || typeof value !== 'boolean',
        )
      )
        throw new Error('Invalid update preferences');
      preferences.update(next);
      patch({});
      return read();
    },
    install() {
      if (disposed || mode !== 'automatic' || state.phase !== 'downloaded') return read();
      patch({ phase: 'installing' });
      // The updater emits before-quit; the existing tray lifecycle then permits exit.
      try {
        updater.quitAndInstall(true, true);
      } catch (error) {
        fail(error);
      }
      return read();
    },
    start() {
      if (timer || interval || mode !== 'automatic') return;
      const scheduled = () => {
        if (preferences.read().autoUpdate) void check();
      };
      timer = setTimeout(scheduled, 15000);
      interval = setInterval(scheduled, 6 * 60 * 60 * 1000);
      timer.unref?.();
      interval.unref?.();
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      clearInterval(interval);
      Object.entries(listeners).forEach(([name, listener]) =>
        updater.removeListener(name, listener),
      );
      // Keep an error listener while an in-flight download is being cancelled at exit.
      updater.on('error', () => {});
    },
  };
}

module.exports = { createUpdates, updateMode, RELEASES };
