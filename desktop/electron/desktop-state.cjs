const fs = require('node:fs');
const path = require('node:path');

function preferences(directory) {
  const file = path.join(directory, 'desktop.json');
  let value = {};
  try {
    value = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {}
  const clean = (next) => ({
    guideSeenVersion:
      Number.isInteger(next?.guideSeenVersion) && next.guideSeenVersion >= 0
        ? Math.min(next.guideSeenVersion, 1)
        : 0,
    ...(next?.language === 'ru' || next?.language === 'en' ? { language: next.language } : {}),
  });
  value = clean(value);
  return {
    read: () => ({ ...value }),
    update(next) {
      if (
        !next ||
        typeof next !== 'object' ||
        Object.keys(next).some((key) => !['guideSeenVersion', 'language'].includes(key))
      )
        throw new Error('Invalid desktop preferences');
      const updated = clean({ ...value, ...next });
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(file + '.tmp', JSON.stringify(updated), { mode: 0o600 });
      fs.renameSync(file + '.tmp', file);
      value = updated;
      return this.read();
    },
  };
}

function connectionProfile(defaults, saved, env) {
  if (env.BOTCONTROL_FORCE_LOCAL === '1') return { ...defaults, mode: 'local' };
  return { ...defaults, ...saved };
}

function defaultPython(root, platform, env) {
  if (env.BOTCONTROL_PYTHON) return env.BOTCONTROL_PYTHON;
  let directory = root;
  for (let depth = 0; depth < 6; depth++) {
    const candidate = path.join(
      directory,
      '.venv',
      platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
    );
    if (fs.existsSync(path.join(directory, 'pyproject.toml')) && fs.existsSync(candidate))
      return candidate;
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return platform === 'win32' ? 'python' : 'python3';
}

module.exports = { preferences, connectionProfile, defaultPython };
