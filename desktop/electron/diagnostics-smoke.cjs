const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function run(browser, root, profile, wait) {
  const page = (code) =>
    browser.webContents.executeJavaScript(code).catch((error) => {
      console.error('Diagnostics evaluation failed:', code);
      throw error;
    });
  const click = (id) => page(`document.querySelector('[data-testid="${id}"]').click()`);
  const input = (id, value) =>
    page(
      `(() => { const el=document.querySelector('[data-testid="${id}"]'); Object.getOwnPropertyDescriptor((el.tagName==='TEXTAREA'?HTMLTextAreaElement:HTMLInputElement).prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true})); })()`,
    );
  await wait(
    page,
    'document.querySelector("[data-testid=resource-memory]")?.textContent.includes("MiB")',
  );
  assert.ok(await page('document.querySelectorAll(".resource-chart svg").length===2'));
  await wait(
    page,
    'document.querySelector("[data-testid=resource-cpu]")?.textContent.includes("%")',
  );
  await page('document.querySelector(".bot-diagnostics").scrollIntoView({block:"start"})');
  await new Promise((resolve) => setTimeout(resolve, 350));
  const output = path.join(root, 'desktop/test-output');
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(
    path.join(output, 'process-resources.png'),
    (await browser.webContents.capturePage()).toPNG(),
  );
  await click('logs-tab');
  await wait(
    page,
    'document.querySelector(".log-entries")?.textContent.includes("existing logger connected")',
  );
  assert.ok(
    await page('document.querySelector(".log-entries").textContent.includes("complex_fixture")'),
  );
  await page(
    `(() => {const el=document.querySelector('.logs-toolbar > input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'Bot is ready');el.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
  await wait(
    page,
    'document.querySelectorAll(".log-entry").length===1 && document.querySelector(".log-entry pre").textContent.includes("Bot is ready")',
  );
  await new Promise((resolve) => setTimeout(resolve, 350));
  fs.writeFileSync(
    path.join(output, 'existing-logger.png'),
    (await browser.webContents.capturePage()).toPNG(),
  );
  browser.setSize(412, 850);
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(
    await page('document.documentElement.scrollWidth <= innerWidth+1'),
    true,
    'mobile bot logs must fit',
  );
  await click('resource-tab');
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(
    await page('document.documentElement.scrollWidth <= innerWidth+1'),
    true,
    'mobile process resources must fit',
  );
  browser.setSize(1200, 850);
  await new Promise((resolve) => setTimeout(resolve, 200));
  await page('document.querySelector(".configure-launch").click()');
  await wait(page, 'document.querySelector("[data-testid=restart-enabled]") !== null');
  await click('restart-enabled');
  await page('document.querySelector(".launch-editor .form-footer .primary-button").click()');
  await wait(
    page,
    'window.botControl.launchProfile("940000001").then(value=>value.profile.restart.enabled===true)',
  );
  await page('document.querySelector(".configure-launch").click()');

  const sourceRoot = process.env.BOTCONTROL_TEST_SOURCE_ROOT || root;
  const project = path.join(sourceRoot, '.test-data', 'Wizard existing bot ' + Date.now());
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(
    path.join(project, 'main.py'),
    'from aiogram import Bot, Dispatcher\nimport os\nclient = Bot(os.environ["BOT_TOKEN"])\nrouter = Dispatcher()\nraise RuntimeError("Must never be executed by discovery")\n',
  );
  fs.writeFileSync(path.join(project, '.env'), 'EXISTING_SETTING=private-wizard-fixture\n');
  await click('add-bot');
  await wait(page, 'document.querySelector("[data-testid=project-wizard][open]") !== null');
  await input('wizard-directory', project);
  await click('wizard-next');
  await wait(page, 'document.querySelector("[data-testid=wizard-snippet]") !== null');
  const snippet = await page('document.querySelector("[data-testid=wizard-snippet]").textContent');
  assert.ok(snippet.includes('bot=client, dispatcher=router'));
  assert.ok(snippet.includes('capture_logs=True'));
  assert.ok(!snippet.includes('private-wizard-fixture'));
  browser.setSize(412, 850);
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal(
    await page(
      'document.querySelector(".project-wizard").scrollWidth <= document.querySelector(".project-wizard").clientWidth+1',
    ),
    true,
    'mobile project wizard must fit',
  );
  browser.setSize(1200, 850);
  await input('wizard-python', profile.python);
  await click('wizard-next');
  await wait(page, 'document.querySelector("[data-testid=wizard-env-file]") !== null');
  assert.equal(await page('document.querySelector("[data-testid=wizard-env-file]").value'), '');
  await input('wizard-bot-id', '952000001');
  await input('wizard-bot-name', 'Wizard test bot');
  await click('wizard-next');
  await wait(page, 'document.querySelector("[data-testid=project-wizard]") === null');
  const snapshot = await page('window.botControl.snapshot({since:0})');
  const added = snapshot.bots.find((bot) => bot.bot_id === '952000001');
  assert.equal(added.state, 'waiting');
  assert.equal(added.integration_pending, true);
  const launch = await page('window.botControl.launchProfile("952000001")');
  assert.deepEqual(launch.profile.required_env, []);
  assert.equal(launch.profile.env_file, '');
  assert.equal(launch.run, null);
  await wait(page, 'document.querySelector("[data-testid=bot-start]")?.disabled === false');
  await click('bot-start');
  await wait(
    page,
    'document.querySelector("[data-testid=launch-output]")?.textContent.includes("Traceback")',
  );
  assert.ok(await page('document.querySelector("[data-testid=launch-diagnostics]").open'));
  await page(
    'document.querySelector("[data-testid=launch-diagnostics]").scrollIntoView({block:"center"})',
  );
  await new Promise((resolve) => setTimeout(resolve, 300));
  fs.writeFileSync(
    path.join(output, 'startup-failure.png'),
    (await browser.webContents.capturePage()).toPNG(),
  );
  console.log(
    'STARTUP_FAILURE_SMOKE_OK: a bot failing before SDK startup shows an expanded, persisted stderr traceback in its process panel.',
  );
  await page(`document.querySelector('[data-bot-id="940000001"]').click()`);
  await wait(page, 'document.querySelector("[data-testid=bot-stop]")?.disabled === false');
  console.log(
    'DIAGNOSTICS_SMOKE_OK: per-bot CPU/RSS charts, existing logger stream/search, restart policy saved, read-only project wizard, existing .env optional, bot registered without executing code.',
  );
}

module.exports = { run };
