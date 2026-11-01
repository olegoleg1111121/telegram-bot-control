const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');

function fixture(app) {
  const updater = new EventEmitter();
  let offline = true;
  updater.checkForUpdates = async () => {
    updater.emit('checking-for-update');
    if (offline) {
      offline = false;
      throw new Error('Simulated offline GitHub connection');
    }
    updater.emit('update-available', { version: '0.8.1' });
  };
  updater.downloadUpdate = async () => {
    updater.emit('download-progress', { percent: 46 });
    await new Promise((resolve) => setTimeout(resolve, 200));
    updater.emit('update-downloaded', { version: '0.8.1' });
  };
  updater.quitAndInstall = (silent, restart) => {
    assert.equal(silent, true);
    assert.equal(restart, true);
    setImmediate(() => {
      require('electron').autoUpdater.emit('before-quit-for-update');
      app.quit();
    });
  };
  return updater;
}

async function run(window, root) {
  const evaluate = (code) => window.webContents.executeJavaScript(code);
  const waitFor = async (code) => {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (await evaluate(code)) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Update UI timed out: ' + code);
  };
  const click = (id) => evaluate(`document.querySelector('[data-testid="${id}"]').click()`);
  await click('nav-settings');
  await waitFor('document.querySelector("[data-testid=update-auto]") !== null');
  await click('update-auto');
  await waitFor('window.botControl.updateStatus().then(s => s.autoUpdate === false)');
  await click('update-check');
  await waitFor('document.querySelector("#update-problem-title") !== null');
  assert.equal(
    await evaluate('document.querySelector("#update-problem-title").closest("dialog").open'),
    true,
  );
  await evaluate(
    'document.querySelector("#update-problem-title").closest("dialog").querySelector(".primary-button").click()',
  );
  await waitFor('document.querySelector("dialog") === null');
  await click('update-check');
  await waitFor('document.querySelector("[data-testid=update-download]") !== null');
  assert.equal((await evaluate('window.botControl.updateStatus()')).phase, 'available');
  await click('update-download');
  await waitFor('document.querySelector("[data-testid=update-install]") !== null');
  assert.equal((await evaluate('window.botControl.updateStatus()')).phase, 'downloaded');
  assert.equal(
    await evaluate('document.querySelector("[data-testid=update-banner]") !== null'),
    true,
  );
  await evaluate(
    'document.querySelector("[data-testid=desktop-updates]").scrollIntoView({block:"center"})',
  );
  await new Promise((resolve) => setTimeout(resolve, 200));
  fs.writeFileSync(
    path.join(root, 'desktop/test-output/desktop-updates.png'),
    (await window.webContents.capturePage()).toPNG(),
  );
  console.log(
    'UPDATES_UI_OK: offline modal, manual check/download, progress events, ready banner and install button.',
  );
}

module.exports = { fixture, run };
