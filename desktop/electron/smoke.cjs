const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function run(window, root) {
  const output = path.join(root, 'desktop/test-output');
  fs.mkdirSync(output, { recursive: true });
  const evaluate = (source) => window.webContents.executeJavaScript(source);
  const screenshot = async (name) => {
    await evaluate(
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    fs.writeFileSync(path.join(output, name), (await window.webContents.capturePage()).toPNG());
  };
  const waitFor = async (condition) => {
    const end = Date.now() + 25000;
    while (Date.now() < end) {
      if (await evaluate(condition)) return;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error(
      'UI condition timed out: ' + condition + '\n' + (await evaluate('document.body.innerText')),
    );
  };
  await waitFor('document.querySelectorAll("[data-testid=bot-item]").length >= 1');
  assert.equal(
    await evaluate('Boolean(window.require || window.process)'),
    false,
    'renderer must be isolated',
  );
  assert.equal(
    await evaluate('document.querySelector("h1").textContent'),
    'Все боты. Один взгляд.',
  );
  assert.equal(await evaluate('document.querySelectorAll(".metric-card").length'), 4);
  await waitFor('!document.querySelector(".spin")');
  await screenshot('overview-ru.png');
  await evaluate('document.querySelector("[data-testid=bot-item]").click()');
  await waitFor('document.querySelector(".bot-detail") !== null');
  await waitFor('document.querySelector(".metric-card > strong").textContent !== "0"');
  await waitFor('!document.querySelector(".spin")');
  await screenshot('bot-detail.png');
  await evaluate('document.querySelector("[data-testid=nav-errors]").click()');
  await waitFor('document.querySelector(".error-row") !== null');
  await evaluate('document.querySelector(".error-row").click()');
  await waitFor('document.querySelector(".traceback pre") !== null');
  assert.match(
    await evaluate('document.querySelector(".traceback pre").textContent'),
    /RuntimeError/,
  );
  await screenshot('errors.png');
  await evaluate('document.querySelector("[data-testid=nav-settings]").click()');
  await waitFor('document.querySelector("[data-testid=language-select]") !== null');
  await evaluate(`(() => { const select = document.querySelector('[data-testid=language-select]');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, 'en');
    select.dispatchEvent(new Event('change', {bubbles:true})); })()`);
  await waitFor('document.querySelector("h1").textContent === "Settings"');
  assert.equal(await evaluate('document.documentElement.lang'), 'en');
  await screenshot('settings-en.png');
  // A shorter retention period must present a preview and explicit confirmation.
  const setRetention = (value) =>
    evaluate(`(() => {
    const select = document.querySelectorAll('.settings-panel')[1].querySelector('select');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, '${value}');
    select.dispatchEvent(new Event('change', {bubbles:true})); })()`);
  const saveRetention = () =>
    evaluate(
      `document.querySelectorAll('.settings-panel')[1].querySelector('.primary-button').click()`,
    );
  await setRetention(30);
  await saveRetention();
  await waitFor('document.querySelector("[role=dialog]") !== null');
  await screenshot('retention-confirm.png');
  await evaluate('document.querySelector(".modal-actions button").click()');
  await waitFor('document.querySelector("[role=dialog]") === null');
  assert.equal(
    await evaluate(
      'window.botControl.snapshot({since:0,until:Date.now()/1000+1}).then(x=>x.settings.statistics_days)',
    ),
    365,
  );
  await saveRetention();
  await waitFor('document.querySelector(".danger-button") !== null');
  await evaluate('document.querySelector(".danger-button").click()');
  await waitFor('document.querySelector(".notice")?.textContent === "Settings saved"');
  assert.equal(
    await evaluate(
      'window.botControl.snapshot({since:0,until:Date.now()/1000+1}).then(x=>x.settings.statistics_days)',
    ),
    30,
  );
  await setRetention(365);
  await saveRetention();
  await waitFor('document.querySelector(".notice")?.textContent === "Settings saved"');
  assert.equal(
    await evaluate(
      'window.botControl.snapshot({since:0,until:Date.now()/1000+1}).then(x=>x.settings.statistics_days)',
    ),
    365,
  );
  await evaluate(`(() => { const select = document.querySelector('[data-testid=language-select]');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, 'ru');
    select.dispatchEvent(new Event('change', {bubbles:true})); })()`);
  await waitFor('document.querySelector("h1").textContent === "Настройки"');
  console.log(
    'SMOKE_OK: Python stdio, bot selection, metrics, traceback, RU/EN, retention preview/cancel/apply, isolated renderer. Screenshots: ' +
      output,
  );
}

module.exports = { run };
