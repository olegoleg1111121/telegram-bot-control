// Fail the release before upload if the updater manifest references a missing/wrong binary.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const yaml = require(require.resolve('js-yaml', { paths: [require.resolve('electron-updater')] }));
const config = require('../package.json');
const directory = path.resolve(process.argv[2] || path.join(__dirname, '../release'));
const manifest = path.join(
  directory,
  process.platform === 'win32' ? 'latest.yml' : 'latest-linux.yml',
);
const info = yaml.load(fs.readFileSync(manifest, 'utf8'));
assert.equal(info.version, config.version);
assert(info.files?.length > 0);
for (const file of info.files) {
  assert.equal(
    file.url,
    path.basename(file.url),
    'Update artifact must be in the release directory',
  );
  const binary = fs.readFileSync(path.join(directory, file.url));
  assert.equal(crypto.createHash('sha512').update(binary).digest('base64'), file.sha512);
  if (file.size) assert.equal(binary.length, file.size);
  if (process.platform === 'win32')
    assert(fs.existsSync(path.join(directory, file.url + '.blockmap')));
}
console.log(
  `Verified ${path.basename(manifest)} and ${info.files.length} update artifact(s) for ${config.version}`,
);
