const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const path = require('node:path');

function shellQuote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

function commandFor(profile) {
  if (!profile || !['local', 'ssh'].includes(profile.mode))
    throw new Error('Invalid connection mode');
  const python = String(profile.python || (profile.mode === 'ssh' ? 'python3' : 'python'));
  if (!python || /[\0\r\n]/.test(python)) throw new Error('Invalid Python executable');
  const args = ['-u', '-m', 'telegram_bot_control.bridge', '--stdio'];
  if (profile.dataDir) {
    if (typeof profile.dataDir !== 'string' || /[\0\r\n]/.test(profile.dataDir))
      throw new Error('Invalid data directory');
    args.push('--data-dir', profile.dataDir);
  }
  if (profile.mode === 'local') return { command: python, args };
  const host = String(profile.host || '');
  const user = String(profile.user || '');
  const port = Number(profile.port ?? 22);
  if (
    !/^[A-Za-z0-9][A-Za-z0-9_.:\[\]-]*$/.test(host) ||
    !/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(user)
  )
    throw new Error('Invalid SSH host or user');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SSH port');
  const ssh = [
    '-T',
    '-o',
    'BatchMode=yes',
    '-o',
    'StrictHostKeyChecking=yes',
    '-o',
    'ConnectTimeout=8',
    '-o',
    'ServerAliveInterval=15',
    '-o',
    'ServerAliveCountMax=2',
    '-p',
    String(port),
  ];
  if (profile.keyPath) {
    if (typeof profile.keyPath !== 'string' || /[\0\r\n]/.test(profile.keyPath))
      throw new Error('Invalid SSH key path');
    ssh.push('-i', profile.keyPath);
  }
  ssh.push('--', `${user}@${host}`, [python, ...args].map(shellQuote).join(' '));
  return { command: 'ssh', args: ssh };
}

class BridgeClient extends EventEmitter {
  constructor(profile, options = {}) {
    super();
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = '';
    this.stderr = '';
    this.closed = false;
    const { command, args } = commandFor(profile);
    this.child = spawn(command, args, {
      windowsHide: true,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUTF8: '1', ...options.env },
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stderr.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => this.consume(chunk));
    this.child.stderr.on('data', (chunk) => {
      this.stderr = (this.stderr + chunk).slice(-3000);
    });
    this.child.stdin.on('error', (error) => this.fail(error));
    this.child.on('error', (error) => this.fail(error));
    this.child.on('exit', (code) =>
      this.fail(new Error(this.stderr.trim() || `Python bridge exited (${code})`)),
    );
  }
  consume(chunk) {
    this.buffer += chunk;
    if (Buffer.byteLength(this.buffer, 'utf8') > 16 * 1024 * 1024) {
      this.fail(new Error('Bridge response too large'));
      this.close();
      return;
    }
    let end;
    while ((end = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 1);
      try {
        const message = JSON.parse(line);
        const pending = this.pending.get(message.id);
        if (!pending) continue;
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        if (message.error) {
          const error = new Error(message.error.message);
          error.remote = true;
          pending.reject(error);
        } else pending.resolve(message.result);
      } catch {
        this.fail(new Error('Invalid JSON from Python bridge'));
      }
    }
  }
  request(method, params = {}) {
    if (this.closed || this.child.exitCode !== null)
      return Promise.reject(new Error('Bridge disconnected'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Bridge request timed out'));
      }, 20000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, method, params }) + '\n', (error) => {
        if (error) this.fail(error);
      });
    });
  }
  fail(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    if (!this.closed) this.emit('disconnected', error.message);
  }
  close() {
    this.closed = true;
    this.fail(new Error('Connection closed'));
    this.child.stdin.end();
    const child = this.child;
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill();
    }, 1000);
    timer.unref();
  }
}

module.exports = { BridgeClient, commandFor, shellQuote };
