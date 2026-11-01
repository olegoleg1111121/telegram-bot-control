const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

async function run(window, root, { app, lifecycle }) {
  const evaluate = (source) =>
    window.webContents.executeJavaScript(source).catch((error) => {
      console.error('Experience evaluation failed:', source);
      throw error;
    });
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (condition) => {
    const end = Date.now() + 25000;
    while (Date.now() < end) {
      if (await evaluate(condition)) return;
      await delay(100);
    }
    throw new Error('Experience UI timed out: ' + condition);
  };
  const click = (id) => evaluate(`document.querySelector('[data-testid="${id}"]').click()`);
  const setInput = (id, value) =>
    evaluate(
      `(() => { const el=document.querySelector('[data-testid="${id}"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', {bubbles:true})); })()`,
    );
  const output = path.join(root, 'desktop/test-output');
  fs.mkdirSync(output, { recursive: true });
  window.show();
  await waitFor('document.querySelector("dialog[open]") !== null');
  const arrowAligned = `(() => {
    const select=document.querySelector('[data-testid="guide-language"]').getBoundingClientRect();
    const arrow=document.querySelector('.guide-language-arrow').getBoundingClientRect();
    return Math.abs((arrow.top+arrow.height/2)-(select.top+select.height/2))<=1 && select.right-arrow.right>=9;
  })()`;
  assert.equal(await evaluate(arrowAligned), true, 'language arrow must stay centered');
  await waitFor(
    'document.querySelector("#guide-title").textContent === "Один сервер. Все ваши боты."',
  );
  await evaluate(
    `document.querySelectorAll('.server-switch strong,.breadcrumb span').forEach(el=>el.textContent='BOT CONTROL LAB')`,
  );
  await delay(200);
  fs.writeFileSync(
    path.join(output, 'onboarding-ru.png'),
    (await window.webContents.capturePage()).toPNG(),
  );
  assert.equal(
    await evaluate('document.querySelector("dialog").contains(document.activeElement)'),
    true,
  );
  await evaluate(`(() => {
    const el=document.querySelector('[data-testid="guide-language"]');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,'en');
    el.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
  await waitFor(
    'document.querySelector("#guide-title").textContent === "One server. All your bots."',
  );
  assert.equal(await evaluate(arrowAligned), true);
  await evaluate(
    `document.querySelectorAll('.server-switch strong,.breadcrumb span').forEach(el=>el.textContent='BOT CONTROL LAB')`,
  );
  await delay(200);
  fs.writeFileSync(
    path.join(output, 'onboarding-welcome.png'),
    (await window.webContents.capturePage()).toPNG(),
  );
  await click('guide-next');
  await waitFor('window.botControl.snapshot({since:0}).then(()=>true).catch(()=>false)');
  const valid = await evaluate('window.botControl.connection()');
  await setInput('connection-python', 'missing-onboarding-python-923847');
  await click('connection-test');
  await waitFor(
    'document.querySelector("[data-testid=connection-result]").classList.contains("error")',
  );
  await waitFor('document.querySelector("[data-testid=connection-problem][open]") !== null');
  assert.ok(
    await evaluate(
      'document.querySelector("#connection-problem-title").textContent.includes("Python")',
    ),
  );
  await click('problem-dismiss');
  assert.equal((await evaluate('window.botControl.connection()')).python, valid.python);
  assert.ok((await evaluate('window.botControl.snapshot({since:0})')).bots);
  await click('find-python');
  await waitFor('document.querySelector("[data-testid=python-candidates] option") !== null');
  await setInput('connection-data', valid.python);
  await click('connection-test');
  await waitFor('document.querySelector("[data-testid=fix-python-fields]") !== null');
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  await delay(200);
  fs.writeFileSync(
    path.join(output, 'connection-path-error.png'),
    (await window.webContents.capturePage()).toPNG(),
  );
  await click('fix-python-fields');
  await waitFor('document.querySelector("[data-testid=connection-problem]") === null');
  assert.equal(
    await evaluate('document.querySelector("[data-testid=connection-python]").value'),
    valid.python,
  );
  assert.equal(await evaluate('document.querySelector("[data-testid=connection-data]").value'), '');
  await setInput('connection-data', valid.dataDir);
  await setInput('connection-python', valid.python);
  await click('connection-test');
  await waitFor(
    'document.querySelector("[data-testid=connection-result]").classList.contains("success")',
  );
  await click('guide-next');
  await waitFor('document.querySelector("[data-testid=guide-code]") !== null');
  const code = await evaluate('document.querySelector("[data-testid=guide-code]").textContent');
  const syntax = spawnSync(valid.python, ['-c', 'import ast,sys; ast.parse(sys.stdin.read())'], {
    input: code,
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(syntax.status, 0, syntax.stderr);
  assert.ok(code.includes('dp.update.outer_middleware(monitor.middleware())'));
  assert.equal(
    await evaluate(
      'document.querySelector("dialog").scrollWidth <= document.querySelector("dialog").clientWidth',
    ),
    true,
  );
  fs.writeFileSync(
    path.join(output, 'onboarding-code.png'),
    (await window.webContents.capturePage()).toPNG(),
  );
  await click('guide-next');
  await click('guide-next');
  await waitFor('document.querySelector("[data-testid=guide-finish]") !== null');
  assert.ok(await evaluate('document.querySelector("dialog").innerText.includes("system tray")'));
  fs.writeFileSync(
    path.join(output, 'onboarding-ready.png'),
    (await window.webContents.capturePage()).toPNG(),
  );
  await click('guide-finish');
  await waitFor('document.querySelector("dialog") === null');
  await click('add-bot');
  await waitFor('document.querySelector("[data-testid=project-wizard][open]") !== null');
  await click('wizard-close');
  await waitFor('document.querySelector("dialog") === null');
  if (await evaluate('document.querySelector("[data-testid=existing-bot]") !== null')) {
    await click('existing-bot');
    await waitFor('document.querySelector("[data-testid=connection-data]") !== null');
  }
  const saved = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'desktop.json')));
  await require('./web-smoke.cjs').run(window, root);
  await require('./quickstart-smoke.cjs').run(root, valid.python);
  await click('nav-integration');
  await waitFor('document.querySelector("[data-testid=ai-prompt]") !== null');
  await click('copy-ai-prompt');
  await waitFor(
    'document.querySelector("[data-testid=copy-ai-prompt]").textContent.includes("Copied")',
  );
  assert.equal(
    require('electron').clipboard.readText(),
    await evaluate('document.querySelector("[data-testid=ai-prompt]").value'),
  );
  console.log('AI_DESKTOP_CLIPBOARD_OK: complete integration prompt copied through desktop IPC.');
  await require('./updates-smoke.cjs').run(window, root);

  assert.equal(saved.guideSeenVersion, 1);
  assert.equal(saved.language, 'en');
  const loaded = new Promise((resolve) => window.webContents.once('did-finish-load', resolve));
  window.webContents.reload();
  await loaded;
  await waitFor('document.querySelector("[data-testid=open-guide]") !== null');
  await delay(500);
  assert.equal(await evaluate('document.querySelector("dialog")'), null);
  await click('open-guide');
  await waitFor('document.querySelector("dialog[open]") !== null');
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await waitFor('document.querySelector("dialog") === null');
  if (process.platform === 'win32') assert.ok(lifecycle.tray && !lifecycle.tray.isDestroyed());
  if (lifecycle.tray) {
    window.close();
    assert.equal(window.isDestroyed(), false);
    assert.equal(window.isVisible(), false);
    assert.ok((await evaluate('window.botControl.snapshot({since:0})')).bots);
    lifecycle.tray.emit('click');
    assert.equal(window.isVisible(), true);
    window.close();
    const restored = new Promise((resolve) =>
      app.once('second-instance', () => setTimeout(resolve, 100)),
    );
    const child = spawn(
      process.execPath,
      [...(app.isPackaged ? [] : [path.resolve(__dirname, '..')]), '--experience-second'],
      { windowsHide: true, stdio: 'ignore' },
    );
    const timeout = setTimeout(() => child.kill(), 15000);
    const code = await new Promise((resolve) => child.once('exit', resolve));
    clearTimeout(timeout);
    assert.equal(code, 0, 'second launch must reuse the existing instance');
    await Promise.race([
      restored,
      delay(5000).then(() => {
        throw new Error('No single-instance activation');
      }),
    ]);
    assert.equal(window.isVisible(), true);
    lifecycle.menu.getMenuItemById('guide').click();
    await waitFor('document.querySelector("dialog[open]") !== null');
    await evaluate('document.querySelector(".guide-later").click()');
    await waitFor('document.querySelector("dialog") === null');
  }
  console.log(
    'EXPERIENCE_SMOKE_OK: first-run RU/EN guide, invalid/valid connection, executable Python snippet, persistence, replay, Escape, close-to-tray, restore, single instance.',
  );
  const ended = new Promise((resolve) =>
    app.once('will-quit', () => {
      assert.equal(window.isDestroyed(), true);
      console.log(
        'UPDATE_RESTART_QUIT_OK: update installation exits instead of hiding in the tray.',
      );
      resolve();
    }),
  );
  await click('nav-settings');
  await waitFor('document.querySelector("[data-testid=update-install]") !== null');
  await click('update-install');
  await ended;
}

module.exports = { run };
