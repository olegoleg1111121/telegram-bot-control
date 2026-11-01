const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { BrowserWindow } = require('electron');

async function run(root, python) {
  const sourceRoot = process.env.BOTCONTROL_TEST_SOURCE_ROOT || root;
  const directory = path.join(sourceRoot, '.test-data', 'quickstart-' + Date.now());
  const script = `import json,webbrowser
from telegram_bot_control.cli import main
class CaptureBrowser(webbrowser.BaseBrowser):
 def open(self,url,new=0,autoraise=True):
  print('BROWSER_URL='+json.dumps(url),flush=True)
  return True
webbrowser.register('capture',None,CaptureBrowser(),preferred=True)
raise SystemExit(main([]))`;
  const child = spawn(python, ['-u', '-c', script], {
    windowsHide: true,
    env: { ...process.env, BOTCONTROL_HOME: directory, PYTHONUTF8: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '',
    stderr = '',
    browser;
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (data) => {
    stdout = (stdout + data).slice(-65536);
  });
  child.stderr.on('data', (data) => {
    stderr = (stderr + data).slice(-3000);
  });
  try {
    const started = Date.now();
    while (
      !stdout.includes('BROWSER_URL=') &&
      child.exitCode === null &&
      Date.now() - started < 20000
    )
      await new Promise((resolve) => setTimeout(resolve, 100));
    const line = stdout.split(/\r?\n/).find((line) => line.startsWith('BROWSER_URL='));
    assert.ok(line, 'Bare tgbots command must open the browser: ' + stderr);
    const url = JSON.parse(line.slice(12));
    assert.ok(new URL(url).hash.startsWith('#launch='));
    browser = new BrowserWindow({
      width: 1200,
      height: 850,
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        partition: 'quickstart-' + Date.now(),
      },
    });
    await browser.loadURL(url);
    const page = (source) => browser.webContents.executeJavaScript(source);
    const until = Date.now() + 20000;
    while (
      !(await page('Boolean(document.querySelector("[data-testid=open-guide]"))')) &&
      Date.now() < until
    )
      await new Promise((resolve) => setTimeout(resolve, 100));
    assert.ok(await page('Boolean(document.querySelector("[data-testid=open-guide]"))'));
    assert.equal(await page('location.hash'), '');
    assert.equal(await page('document.querySelector("[data-testid=web-login]")'), null);
    assert.equal((await page('window.botControl.connection()')).python, python);
    if (await page('Boolean(document.querySelector("dialog[open]"))'))
      await page('document.querySelector(".guide-later").click()');
    await page('document.querySelector("[data-testid=nav-settings]").click()');
    assert.equal(await page('document.querySelector("[data-testid=connection-python]")'), null);
    fs.mkdirSync(path.join(root, 'desktop/test-output'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'desktop/test-output/quickstart.png'),
      (await browser.webContents.capturePage()).toPNG(),
    );
    console.log(
      'QUICKSTART_SMOKE_OK: bare tgbots opens bundled UI, signs in once, clears launch fragment, uses its own Python without a picker.',
    );
  } finally {
    browser?.destroy();
    child.kill();
    await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', resolve);
      setTimeout(resolve, 3000);
    });
  }
}
module.exports = { run };
