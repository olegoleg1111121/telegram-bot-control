const assert = require('node:assert/strict');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const { BrowserWindow } = require('electron');
const { spawnSync } = require('node:child_process');

async function run(window, root) {
  const sourceRoot = process.env.BOTCONTROL_TEST_SOURCE_ROOT || root;
  const evaluate = (code) =>
    window.webContents.executeJavaScript(code).catch((error) => {
      console.error('Web setup evaluation failed:', code);
      throw error;
    });
  const profile = await evaluate('window.botControl.connection()');
  assert.equal(
    (await evaluate('window.botControl.snapshot({since:0})')).bots.length,
    0,
    'Web smoke requires an empty isolated data directory',
  );
  const fixture = spawnSync(
    profile.python,
    [
      path.join(sourceRoot, 'scripts/control_fixture.py'),
      '--data-dir',
      profile.dataDir,
      '--project-dir',
      path.join(sourceRoot, '.test-data', 'Web complex fixture ' + Date.now()),
    ],
    { windowsHide: true, encoding: 'utf8' },
  );
  assert.equal(fixture.status, 0, fixture.stderr);
  const wait = async (evaluate, condition) => {
    const end = Date.now() + 25000;
    while (Date.now() < end) {
      if (await evaluate(condition)) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Web UI condition timed out: ' + condition);
  };
  const socket = net.createServer();
  await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  await evaluate('document.querySelector("[data-testid=nav-settings]").click()');
  await wait(evaluate, 'document.querySelector("[data-testid=web-port]") !== null');
  await evaluate(
    `(() => {const el=document.querySelector('[data-testid=web-port]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(String(port))});el.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
  await evaluate('document.querySelector("[data-testid=web-toggle]").click()');
  await wait(evaluate, 'window.botControl.webStatus().then(value=>value.running)');
  const info = await evaluate('window.botControl.webStatus()');
  await evaluate('document.querySelector("[data-testid=nav-errors]").click()');
  await evaluate('document.querySelector("[data-testid=nav-settings]").click()');
  await wait(
    evaluate,
    `document.querySelector('[data-testid=web-port]')?.value === ${JSON.stringify(String(port))}`,
  );
  const unauth = await fetch(info.url + '/api/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Bot-Control': '1', Origin: info.url },
    body: JSON.stringify({ method: 'snapshot' }),
  });
  assert.equal(unauth.status, 401);
  const browser = new BrowserWindow({
    width: 1200,
    height: 850,
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'web-smoke-' + Date.now(),
    },
  });
  const page = (code) => browser.webContents.executeJavaScript(code);
  try {
    await browser.loadURL(info.url);
    await wait(page, 'document.querySelector("[data-testid=web-login]")?.disabled === false');
    assert.equal(await page('Boolean(window.require || window.process)'), false);
    await page(
      `(() => {const el=document.querySelector('[data-testid=web-key]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(info.key)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
    await page('document.querySelector("[data-testid=web-login]").click()');
    await wait(page, 'document.querySelector("dialog[open]") !== null');
    await page('document.querySelector(".guide-later").click()');
    await wait(page, 'document.querySelector("dialog") === null');
    const snapshot = await page('window.botControl.snapshot({since:0})');
    assert.equal(snapshot.meta.transport, 'http');
    await wait(page, 'document.querySelector("[data-testid=bot-item]") !== null');
    await page('document.querySelector("[data-testid=bot-item]").click()');
    await wait(page, 'document.querySelector("[data-testid=bot-start]")?.disabled === false');
    await page('document.querySelector("[data-testid=bot-start]").click()');
    await wait(
      page,
      'window.botControl.snapshot({since:0}).then(data=>data.bots[0].state==="running" && data.totals.events>=4)',
    );
    const first = await page(
      'window.botControl.launchProfile("940000001").then(data=>data.run.id)',
    );
    await require('./diagnostics-smoke.cjs').run(browser, root, profile, wait);
    await wait(page, 'document.querySelector("[data-testid=bot-restart]")?.disabled === false');
    await page('document.querySelector("[data-testid=bot-restart]").click()');
    await wait(
      page,
      `window.botControl.launchProfile('940000001').then(data=>data.run.id!==${JSON.stringify(first)} && data.run.status==='running')`,
    );
    await wait(page, 'document.querySelector("[data-testid=bot-stop]")?.disabled === false');
    await page('document.querySelector("[data-testid=bot-stop]").click()');
    await wait(
      page,
      'window.botControl.snapshot({since:0}).then(data=>data.bots[0].state==="stopped")',
    );
    await page('document.fonts.ready');
    assert.ok(
      await page(
        'Array.from(document.fonts).some(font=>font.family.includes("Inter") && font.status==="loaded")',
      ),
    );
    await page('document.querySelector("[data-testid=nav-settings]").click()');
    await wait(page, 'document.querySelector(".web-connection-note") !== null');
    assert.equal(await page('document.querySelector("[data-testid=web-port]")'), null);
    await page('document.querySelector(".primary-nav button").click()');
    browser.setSize(412, 850);
    await new Promise((resolve) => setTimeout(resolve, 300));
    fs.mkdirSync(path.join(root, 'desktop/test-output'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'desktop/test-output/web-mobile-debug.png'),
      (await browser.webContents.capturePage()).toPNG(),
    );
    if (!(await page('document.documentElement.scrollWidth <= innerWidth+1')))
      console.log(
        await page(
          `JSON.stringify({inner:innerWidth,scroll:document.documentElement.scrollWidth,elements:Array.from(document.querySelectorAll('body *')).map(el=>({tag:el.tagName,classes:el.className,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right})).filter(el=>el.right>innerWidth+1).slice(0,18)})`,
        ),
      );
    assert.equal(
      await page('document.documentElement.scrollWidth <= innerWidth+1'),
      true,
      'phone layout must not scroll horizontally',
    );
    await page(
      `document.querySelectorAll('.server-switch strong,.breadcrumb span').forEach(el=>el.textContent='BOT CONTROL LAB');document.querySelectorAll('.empty-data-location code').forEach(el=>el.textContent='/srv/bot-control/data')`,
    );
    const output = path.join(root, 'desktop/test-output');
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(
      path.join(output, 'web-mobile.png'),
      (await browser.webContents.capturePage()).toPNG(),
    );
    await page('document.querySelector("[data-testid=web-logout]").click()');
    await wait(page, 'document.querySelector("[data-testid=web-login]") !== null');
  } finally {
    await evaluate('window.botControl.controlBot("940000001","stop",true).catch(()=>null)');
    browser.destroy();
    await evaluate('window.botControl.stopWeb()');
  }
  assert.equal((await evaluate('window.botControl.webStatus()')).running, false);
  console.log(
    'WEB_SMOKE_OK: desktop listener controls, HTTP login, browser Start/Restart/Stop, shared history, local Cyrillic font, phone layout and logout.',
  );
}

module.exports = { run };
