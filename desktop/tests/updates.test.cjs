const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createUpdates, updateMode } = require('../electron/updates.cjs');

function fixture(options = {}) {
  const updater = new EventEmitter();
  let checked = 0;
  let downloaded = 0;
  let installed = 0;
  let prefs = { autoUpdate: true, includePrereleases: true, ...options.preferences };
  updater.checkForUpdates = async () => {
    checked++;
    updater.emit('checking-for-update');
    if (options.offline) throw new Error('Network unavailable');
    updater.emit(options.current ? 'update-not-available' : 'update-available', {
      version: '0.9.0',
    });
  };
  updater.downloadUpdate = async () => {
    downloaded++;
    if (options.corrupt) {
      const error = new Error('SHA512 checksum mismatch');
      updater.emit('error', error);
      throw error;
    }
    updater.emit('download-progress', { percent: 53.9 });
    updater.emit('update-downloaded', { version: '0.9.0' });
  };
  updater.quitAndInstall = (...args) => {
    installed++;
    assert.deepEqual(args, [true, true]);
    if (options.installFails) updater.emit('error', new Error('Access denied'));
  };
  const events = [];
  const notifications = [];
  const controller = createUpdates({
    updater,
    version: '0.8.0',
    mode: options.mode || 'automatic',
    preferences: {
      read: () => ({ ...prefs }),
      update: (next) => {
        prefs = { ...prefs, ...next };
      },
    },
    changed: (state) => events.push(state),
    notify: (version) => notifications.push(version),
  });
  return {
    controller,
    updater,
    events,
    notifications,
    counts: () => ({ checked, downloaded, installed }),
  };
}

test('automatic checks download once; installation waits for the owner', async () => {
  const f = fixture();
  const results = await Promise.all([
    f.controller.check(),
    f.controller.check(),
    f.controller.check(),
  ]);
  assert(results.every((state) => state.phase === 'downloaded'));
  assert.deepEqual(f.counts(), { checked: 1, downloaded: 1, installed: 0 });
  assert.equal(f.controller.read().phase, 'downloaded');
  assert.equal(f.updater.autoInstallOnAppQuit, false);
  assert.equal(f.updater.allowDowngrade, false);
  assert.equal(f.updater.allowPrerelease, true);
  assert.deepEqual(f.notifications, ['0.9.0']);
  assert(f.events.some((event) => event.progress === 53.9));
  await f.controller.check();
  f.controller.install();
  f.controller.install();
  assert.deepEqual(f.counts(), { checked: 1, downloaded: 1, installed: 1 });
  f.controller.dispose();
});

test('manual mode checks without downloading, then downloads on request', async () => {
  const f = fixture({ preferences: { autoUpdate: false, includePrereleases: false } });
  f.controller.install();
  await f.controller.check();
  assert.equal(f.controller.read().phase, 'available');
  assert.equal(f.counts().downloaded, 0);
  assert.equal(f.updater.allowPrerelease, false);
  await Promise.all([f.controller.download(), f.controller.download()]);
  assert.equal(f.counts().downloaded, 1);
  f.controller.configure({ autoUpdate: true });
  assert.equal(f.controller.read().autoUpdate, true);
  assert.throws(() => f.controller.configure({ feedURL: 'https://example.invalid' }), /Invalid/);
  assert.throws(() => f.controller.configure({ autoUpdate: 'true' }), /Invalid/);
  f.controller.dispose();
});

test('offline and corrupt downloads remain recoverable and cannot be installed', async () => {
  for (const options of [{ offline: true }, { corrupt: true }]) {
    const f = fixture(options);
    await f.controller.check();
    assert.equal(f.controller.read().phase, 'error');
    assert.match(f.controller.read().error, /Network|checksum/);
    f.controller.install();
    assert.equal(f.counts().installed, 0);
    f.controller.dispose();
  }
});

test('no update and installer failures report truthful states', async () => {
  const current = fixture({ current: true });
  await current.controller.check();
  assert.equal(current.controller.read().phase, 'current');
  assert(current.controller.read().checkedAt > 0);
  assert.equal(current.counts().downloaded, 0);
  current.controller.dispose();
  const failed = fixture({ installFails: true });
  await failed.controller.check();
  failed.controller.install();
  assert.equal(failed.controller.read().phase, 'error');
  failed.controller.dispose();
});

test('development and extracted builds never contact the update service', async () => {
  for (const mode of ['development', 'portable', 'unsupported']) {
    const f = fixture({ mode });
    f.controller.start();
    await f.controller.check();
    await f.controller.download();
    f.controller.install();
    assert.equal(f.controller.read().phase, 'unavailable');
    assert.deepEqual(f.counts(), { checked: 0, downloaded: 0, installed: 0 });
    f.controller.dispose();
  }
});

test('AppImage and NSIS installations are distinguished from extracted builds', () => {
  const base = { packaged: true, executable: '/apps/control.exe', exists: () => false };
  assert.equal(updateMode({ ...base, platform: 'win32' }), 'portable');
  assert.equal(updateMode({ ...base, platform: 'win32', exists: () => true }), 'automatic');
  assert.equal(updateMode({ ...base, platform: 'linux' }), 'portable');
  assert.equal(
    updateMode({ ...base, platform: 'linux', appImage: '/apps/control.AppImage' }),
    'automatic',
  );
  assert.equal(updateMode({ ...base, platform: 'win32', packaged: false }), 'development');
});

test('scheduled checks respect the preference and stop on shutdown', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const f = fixture({ preferences: { autoUpdate: false } });
  f.controller.start();
  t.mock.timers.tick(15000);
  assert.equal(f.counts().checked, 0);
  f.controller.configure({ autoUpdate: true });
  t.mock.timers.tick(6 * 60 * 60 * 1000);
  await f.controller.check();
  assert.equal(f.counts().checked, 1);
  f.controller.dispose();
  t.mock.timers.tick(12 * 60 * 60 * 1000);
  assert.equal(f.counts().checked, 1);
});
