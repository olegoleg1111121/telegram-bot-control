const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { preferences, connectionProfile, defaultPython } = require('../electron/desktop-state.cjs');

function temporary() {
  const root = path.resolve(__dirname, '../../.test-data');
  fs.mkdirSync(root, { recursive: true });
  return fs.mkdtempSync(path.join(root, 'desktop-state-'));
}

test('guide completion and language persist across new desktop sessions', () => {
  const directory = temporary();
  const first = preferences(directory);
  assert.equal(first.read().guideSeenVersion, 0);
  first.update({ guideSeenVersion: 1, language: 'en' });
  assert.deepEqual(preferences(directory).read(), {
    guideSeenVersion: 1,
    language: 'en',
    autoUpdate: true,
    includePrereleases: true,
  });
  first.update({ autoUpdate: false });
  assert.equal(preferences(directory).read().autoUpdate, false);
  assert.throws(() => first.update({ path: '../outside' }), /Invalid/);
  assert.equal(fs.existsSync(path.join(directory, 'desktop.json.tmp')), false);
});

test('corrupt preferences allow first-run recovery without discarding connection files', () => {
  const directory = temporary();
  fs.writeFileSync(path.join(directory, 'desktop.json'), '{broken');
  fs.writeFileSync(path.join(directory, 'connection.json'), '{"mode":"ssh"}');
  assert.equal(preferences(directory).read().guideSeenVersion, 0);
  preferences(directory).update({ language: 'ru' });
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'connection.json'))).mode, 'ssh');
});

test('explicit local CLI parameters override a saved SSH connection', () => {
  const local = { mode: 'local', python: '/local/python', dataDir: '/chosen/data' };
  const saved = { mode: 'ssh', python: '/remote/python', dataDir: '/remote/data' };
  assert.deepEqual(connectionProfile(local, saved, {}), saved);
  assert.deepEqual(connectionProfile(local, saved, { BOTCONTROL_FORCE_LOCAL: '1' }), local);
});

test('packaged app inside the checkout locates the SDK Python, environment override wins', () => {
  const root = temporary();
  fs.mkdirSync(path.join(root, '.venv/Scripts'), { recursive: true });
  fs.writeFileSync(path.join(root, '.venv/Scripts/python.exe'), 'fixture');
  fs.writeFileSync(path.join(root, 'pyproject.toml'), '');
  const resources = path.join(root, 'release/desktop-build/win-unpacked/resources');
  assert.equal(defaultPython(resources, 'win32', {}), path.join(root, '.venv/Scripts/python.exe'));
  assert.equal(
    defaultPython(resources, 'win32', { BOTCONTROL_PYTHON: '/chosen/python' }),
    '/chosen/python',
  );
  assert.equal(defaultPython(temporary(), 'linux', {}), 'python3');
});
