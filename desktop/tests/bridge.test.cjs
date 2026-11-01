const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { BridgeClient, commandFor, shellQuote } = require('../electron/bridge-client.cjs');

test('SSH uses stdio, no port forwarding, no local shell, and quotes remote paths', () => {
  const profile = {
    mode: 'ssh',
    python: "/opt/bot's env/bin/python",
    dataDir: '/data/a;$(touch /tmp/injected)',
    host: 'example.test',
    user: 'owner',
    port: 2222,
    keyPath: 'C:\\keys\\owner',
  };
  const command = commandFor(profile);
  assert.equal(command.command, 'ssh');
  assert.ok(command.args.includes('StrictHostKeyChecking=yes'));
  assert.ok(!command.args.includes('-L'));
  assert.equal(command.args.at(-2), 'owner@example.test');
  assert.ok(command.args.at(-1).includes(shellQuote(profile.python)));
  assert.ok(command.args.at(-1).includes(shellQuote(profile.dataDir)));
  assert.throws(() => commandFor({ ...profile, host: '-oProxyCommand=bad' }));
  assert.throws(() => commandFor({ ...profile, user: 'a;bad' }));
  assert.throws(() => commandFor({ ...profile, port: 0 - 1 }));
});

test('desktop reads a genuine Python bridge through child-process pipes', async () => {
  const root = path.resolve(__dirname, '../..');
  fs.mkdirSync(path.join(root, '.test-data'), { recursive: true });
  const directory = fs.mkdtempSync(path.join(root, '.test-data', 'node-'));
  const python =
    process.env.BOTCONTROL_PYTHON ||
    path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const client = new BridgeClient({ mode: 'local', python, dataDir: directory });
  client.on('disconnected', () => {});
  try {
    const hello = await client.request('hello');
    assert.equal(hello.transport, 'stdio');
    const [first, second] = await Promise.all([
      client.request('snapshot'),
      client.request('snapshot'),
    ]);
    assert.deepEqual(first.bots, []);
    assert.equal(second.meta.data_dir, directory);
    await assert.rejects(client.request('unknown'), /Unknown method/);
    assert.equal((await client.request('hello')).version, '0.8.0');
  } finally {
    client.close();
  }
});

test('missing Python gives a bounded, actionable error', async () => {
  const client = new BridgeClient({ mode: 'local', python: 'missing-botcontrol-python-982345' });
  client.on('disconnected', () => {});
  try {
    await assert.rejects(client.request('hello'), /ENOENT|spawn|disconnected/i);
  } finally {
    client.close();
  }
});
