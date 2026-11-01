const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  discoverPythons,
  probePython,
  installationCommand,
  validateDataDirectory,
  launcherPaths,
  run,
} = require('../electron/python-discovery.cjs');

function temporary() {
  const base = path.resolve(__dirname, '../../.test-data');
  fs.mkdirSync(base, { recursive: true });
  return fs.mkdtempSync(path.join(base, 'python-discovery-'));
}
function fakePython(root, name) {
  const file = path.join(root, 'Programs/Python', name, 'python.exe');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'fixture; never execute');
  return file;
}
function response(executable, version = [3, 14, 0], sdk = false) {
  return {
    code: 0,
    stderr: '',
    stdout:
      'startup message\nBOTCONTROL_PYTHON=' +
      JSON.stringify({
        executable,
        version,
        sdk,
        sdkVersion: sdk ? '0.6.1' : '',
        pip: true,
        virtual: false,
      }) +
      '\n',
  };
}

test('discovers a normal Windows installation outside PATH and prefers an SDK-ready runtime', async () => {
  const root = temporary(),
    older = fakePython(root, 'Python312'),
    newer = fakePython(root, 'Python314');
  const commands = [];
  const execute = async (command, args) => {
    commands.push([command, args]);
    if (args.includes('-NoProfile'))
      return { code: 0, stdout: JSON.stringify([older, newer]), stderr: '' };
    if (args.includes('-0p')) return { code: 0, stdout: '', stderr: '' };
    if (command === older) return response(older, [3, 12, 9], true);
    if (command === newer) return response(newer);
    throw new Error('Unexpected command');
  };
  const result = await discoverPythons({
    platform: 'win32',
    env: { LOCALAPPDATA: root, PATH: '' },
    execute,
  });
  assert.equal(result.recommended, older);
  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[1].version, '3.14.0');
  assert.equal(result.candidates[1].sdk, false);
  assert.ok(commands.every(([, args]) => !args.includes('install')));
});

test('launcher parsing preserves full paths with spaces and Unicode', () => {
  assert.deepEqual(
    launcherPaths(
      ' -V:3.14 * C:\\Users\\Имя пользователя\\Python314\\python.exe\r\n -3.12-32 C:\\Python312\\python.exe',
    ),
    ['C:\\Users\\Имя пользователя\\Python314\\python.exe', 'C:\\Python312\\python.exe'],
  );
});

test('probes the actual interpreter and rejects Store aliases without launching them', async () => {
  const python =
    process.env.BOTCONTROL_PYTHON ||
    path.resolve(
      __dirname,
      '../../.venv',
      process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
    );
  const actual = await probePython(python, { platform: process.platform });
  assert.ok(actual?.compatible && actual.sdk);
  assert.ok(path.isAbsolute(actual.executable));
  let launched = false;
  assert.equal(
    await probePython('C:\\Profiles\\Example\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe', {
      run: async () => {
        launched = true;
      },
    }),
    null,
  );
  assert.equal(launched, false);
});

test('rejects malformed probe output and flags older Python versions', async () => {
  assert.equal(
    await probePython('fixture', { run: async () => ({ code: 0, stdout: 'Python', stderr: '' }) }),
    null,
  );
  const old = await probePython('fixture', {
    run: async () => response(path.resolve('python'), [3, 10, 9]),
  });
  assert.equal(old.compatible, false);
});

test('detects a Python file or installation folder mistakenly used as data storage', () => {
  const root = temporary(),
    python = fakePython(root, 'Python314');
  for (const value of [python, path.dirname(python)])
    assert.throws(
      () => validateDataDirectory(value),
      (error) => error.code === 'data_is_python' && error.python === python,
    );
  const file = path.join(root, 'not-a-folder.txt');
  fs.writeFileSync(file, 'fixture');
  assert.throws(
    () => validateDataDirectory(file),
    (error) => error.code === 'data_not_directory',
  );
  assert.doesNotThrow(() => validateDataDirectory(''));
  assert.doesNotThrow(() => validateDataDirectory(path.join(root, 'new-data')));
});

test('installation command quotes the selected Python for PowerShell and POSIX shells', () => {
  assert.equal(
    installationCommand("C:\\O'Brian\\python.exe", 'win32'),
    "& 'C:\\O''Brian\\python.exe' -m pip install --upgrade telegram-bot-control",
  );
  assert.ok(installationCommand("/bot's/python", 'linux', false).includes("'\\''"));
  assert.ok(installationCommand('/python', 'linux', false).includes('-m ensurepip --upgrade'));
});

test('discovery subprocesses have a timeout, bounded output and disable runtime auto-install', async () => {
  assert.equal(
    (await run(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeout: 40 })).error,
    'timeout',
  );
  assert.equal(
    (await run(process.execPath, ['-e', "process.stdout.write('x'.repeat(100000))"])).error,
    'output_limit',
  );
  const result = await run(process.execPath, [
    '-e',
    'console.log(process.env.PYTHON_MANAGER_AUTOMATIC_INSTALL)',
  ]);
  assert.equal(result.stdout.trim(), 'false');
});
