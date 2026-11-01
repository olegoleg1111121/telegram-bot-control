const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

const PROBE = `import sys,json,importlib.util,importlib.metadata
try: version=importlib.metadata.version('telegram-bot-control')
except importlib.metadata.PackageNotFoundError: version=''
print('BOTCONTROL_PYTHON='+json.dumps(dict(executable=sys.executable,version=list(sys.version_info[:3]),sdk=importlib.util.find_spec('telegram_bot_control') is not None and importlib.util.find_spec('psutil') is not None,sdkVersion=version,pip=importlib.util.find_spec('pip') is not None,virtual=sys.prefix!=sys.base_prefix)))`;

// Read PEP 514 registrations without relying on the console's OEM code page.
const REGISTRY = `[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding
$pyPaths = New-Object System.Collections.Generic.List[string]
foreach ($pyHive in @([Microsoft.Win32.RegistryHive]::CurrentUser,[Microsoft.Win32.RegistryHive]::LocalMachine)) {
 foreach ($pyView in @([Microsoft.Win32.RegistryView]::Registry64,[Microsoft.Win32.RegistryView]::Registry32)) {
  $pyBase=$null; $pyRoot=$null
  try {
   $pyBase=[Microsoft.Win32.RegistryKey]::OpenBaseKey($pyHive,$pyView)
   $pyRoot=$pyBase.OpenSubKey('Software\\Python')
   if ($pyRoot) { foreach ($pyCompany in $pyRoot.GetSubKeyNames() | Select-Object -First 64) {
    $pyCompanyKey=$pyRoot.OpenSubKey($pyCompany)
    try { foreach ($pyTag in $pyCompanyKey.GetSubKeyNames() | Select-Object -First 64) {
     $pyInstall=$pyCompanyKey.OpenSubKey($pyTag+'\\InstallPath')
     if ($pyInstall) { try {
      $pyExe=$pyInstall.GetValue('ExecutablePath'); $pyDir=$pyInstall.GetValue('')
      if ($pyExe) {$pyPaths.Add([string]$pyExe)} elseif ($pyDir) {$pyPaths.Add((Join-Path $pyDir 'python.exe'))}
     } finally {$pyInstall.Dispose()} }
    }} finally {$pyCompanyKey.Dispose()}
   }}
  } catch {} finally {if ($pyRoot) {$pyRoot.Dispose()}; if ($pyBase) {$pyBase.Dispose()}}
 }
}
ConvertTo-Json -InputObject @($pyPaths | Select-Object -Unique -First 64) -Compress`;

function run(command, args, { env = process.env, timeout = 3500 } = {}) {
  return new Promise((resolve) => {
    let stdout = '',
      stderr = '',
      finished = false;
    const child = spawn(command, args, {
      windowsHide: true,
      shell: false,
      cwd: os.tmpdir(),
      env: {
        ...env,
        PYTHONUTF8: '1',
        PYTHONIOENCODING: 'utf-8',
        PYTHON_MANAGER_AUTOMATIC_INSTALL: 'false',
        PYLAUNCHER_ALLOW_INSTALL: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const done = (code, error = '') => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr, error });
    };
    const timer = setTimeout(() => {
      child.kill();
      done(-1, 'timeout');
    }, timeout);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (text) => {
      stdout += text;
      if (stdout.length > 65536) {
        child.kill();
        done(-1, 'output_limit');
      }
    });
    child.stderr.on('data', (text) => {
      stderr = (stderr + text).slice(-3000);
    });
    child.on('error', (error) => done(-1, error.code || 'spawn_failed'));
    child.on('close', (code) => done(code));
  });
}

function clean(value) {
  return String(value || '')
    .trim()
    .replace(/^"(.*)"$/, '$1');
}
function alias(value) {
  return /^(?:python(?:3)?(?:\.exe)?|py(?:\.exe)?)$/i.test(clean(value));
}
function storeAlias(value) {
  return /[\\/]Microsoft[\\/]WindowsApps[\\/]python(?:3(?:\.\d+)?)?\.exe$/i.test(value);
}
function launcherPaths(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.match(/((?:[A-Za-z]:\\|\\\\).*?python(?:[\d.]*)?\.exe)\s*$/i)?.[1])
    .filter(Boolean);
}
function installationCommand(executable, platform = process.platform, pip = true) {
  const quoted = "'" + executable.replaceAll("'", platform === 'win32' ? "''" : "'\\''") + "'";
  const python = (platform === 'win32' ? '& ' : '') + quoted;
  return (
    (pip ? '' : `${python} -m ensurepip --upgrade\n`) +
    `${python} -m pip install --upgrade telegram-bot-control`
  );
}

async function probePython(value, options = {}) {
  let executable = clean(value);
  if (
    !executable ||
    executable.length > 4096 ||
    /[\0\r\n]/.test(executable) ||
    storeAlias(executable)
  )
    return null;
  try {
    if (fs.statSync(executable).isDirectory())
      executable = path.join(
        executable,
        (options.platform || process.platform) === 'win32' ? 'python.exe' : 'bin/python',
      );
  } catch {}
  const result = await (options.run || run)(executable, ['-c', PROBE], options);
  if (result.code !== 0) return null;
  try {
    const data = JSON.parse(
      result.stdout
        .split(/\r?\n/)
        .find((line) => line.startsWith('BOTCONTROL_PYTHON='))
        ?.slice(18),
    );
    if (
      !data ||
      typeof data.executable !== 'string' ||
      !path.isAbsolute(data.executable) ||
      !Array.isArray(data.version) ||
      data.version.length !== 3 ||
      !data.version.every(Number.isInteger)
    )
      return null;
    return {
      executable: data.executable,
      version: data.version.join('.'),
      versionParts: data.version,
      compatible: data.version[0] === 3 && data.version[1] >= 11,
      sdk: data.sdk === true,
      sdkVersion: String(data.sdkVersion || '').slice(0, 80),
      pip: data.pip === true,
      virtual: data.virtual === true,
    };
  } catch {
    return null;
  }
}

async function discoverPythons({
  root,
  preferred = [],
  platform = process.platform,
  env = process.env,
  execute = run,
} = {}) {
  const found = new Map();
  function add(value, source) {
    value = clean(value);
    if (!value || alias(value) || storeAlias(value) || found.size >= 48) return;
    const key = platform === 'win32' ? value.toLowerCase() : value;
    if (!found.has(key)) found.set(key, { path: value, source });
  }
  for (const value of [...preferred, env.BOTCONTROL_PYTHON]) add(value, 'selected');
  for (const prefix of [env.VIRTUAL_ENV, env.CONDA_PREFIX])
    if (prefix)
      add(
        path.join(prefix, platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'),
        'environment',
      );
  if (root)
    add(
      path.join(root, '.venv', platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'),
      'project',
    );
  if (platform === 'win32') {
    const results = await Promise.all([
      execute(
        path.join(
          env.SystemRoot || 'C:\\Windows',
          'System32/WindowsPowerShell/v1.0/powershell.exe',
        ),
        ['-NoProfile', '-NonInteractive', '-Command', REGISTRY],
        { env, timeout: 4000 },
      ),
      execute('py', ['-0p'], { env, timeout: 2500 }),
    ]);
    try {
      for (const value of JSON.parse(results[0].stdout.replace(/^\uFEFF/, '')))
        add(value, 'registry');
    } catch {}
    for (const value of launcherPaths(results[1].stdout)) add(value, 'launcher');
    for (const parent of [
      env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs/Python'),
      env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Python'),
      env.ProgramFiles,
      env['ProgramFiles(x86)'],
      env.SystemDrive && env.SystemDrive + '\\',
    ]) {
      if (!parent) continue;
      try {
        for (const name of fs
          .readdirSync(parent)
          .filter((name) => /^(Python3|pythoncore-3)/i.test(name))
          .slice(0, 20))
          add(path.join(parent, name, 'python.exe'), 'installation');
      } catch {}
    }
  }
  const names =
    platform === 'win32'
      ? ['python.exe', 'python3.exe']
      : ['python3', 'python', ...Array.from({ length: 8 }, (_, i) => `python3.${i + 11}`)];
  for (const directory of String(env.PATH || env.Path || '')
    .split(platform === 'win32' ? ';' : ':')
    .filter(Boolean)
    .slice(0, 96)) {
    for (const name of names) {
      const value = path.join(directory, name);
      try {
        if (fs.statSync(value).isFile()) add(value, 'path');
      } catch {}
    }
  }
  const items = [...found.values()]
    .filter((item) => {
      try {
        return fs.statSync(item.path).isFile();
      } catch {
        return false;
      }
    })
    .slice(0, 24);
  const candidates = [],
    seen = new Set();
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, items.length) }, async () => {
      while (next < items.length) {
        const item = items[next++];
        const result = await probePython(item.path, { env, platform, run: execute });
        if (!result) continue;
        let identity = result.executable;
        if (!result.virtual) {
          try {
            identity = fs.realpathSync(identity);
          } catch {}
        }
        if (platform === 'win32') identity = identity.toLowerCase();
        if (seen.has(identity)) continue;
        seen.add(identity);
        candidates.push({ ...result, source: item.source });
      }
    }),
  );
  candidates.sort(
    (a, b) =>
      Number(b.compatible && b.sdk) - Number(a.compatible && a.sdk) ||
      Number(b.compatible) - Number(a.compatible) ||
      b.versionParts[1] - a.versionParts[1] ||
      b.versionParts[2] - a.versionParts[2] ||
      a.executable.localeCompare(b.executable),
  );
  return { candidates, recommended: candidates.find((item) => item.compatible)?.executable || '' };
}

function validateDataDirectory(value) {
  if (!value) return;
  if (typeof value !== 'string' || /[\0\r\n]/.test(value))
    throw Object.assign(new Error('Invalid data directory'), { code: 'data_invalid' });
  const directory = clean(value);
  let directoryExists = false;
  try {
    directoryExists = fs.statSync(directory).isDirectory();
  } catch {}
  if (!directoryExists && /(?:^|[\\/])python[\d.]*(?:\.exe)?$/i.test(directory))
    throw Object.assign(new Error('Python executable entered as data directory'), {
      code: 'data_is_python',
      python: directory,
    });
  try {
    const stat = fs.statSync(directory);
    if (!stat.isDirectory())
      throw Object.assign(new Error('Choose a folder, not a file'), { code: 'data_not_directory' });
    for (const name of ['python.exe', 'python3', 'bin/python']) {
      const executable = path.join(directory, name);
      if (fs.existsSync(executable))
        throw Object.assign(new Error('Python installation entered as data directory'), {
          code: 'data_is_python',
          python: executable,
        });
    }
    fs.accessSync(directory, fs.constants.R_OK | fs.constants.W_OK);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    if (error.code?.startsWith('data_')) throw error;
    throw Object.assign(new Error('Data directory is not accessible'), {
      code: 'data_unavailable',
    });
  }
}

module.exports = {
  discoverPythons,
  probePython,
  installationCommand,
  validateDataDirectory,
  launcherPaths,
  alias,
  run,
};
