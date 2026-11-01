const fs = require('node:fs');
const path = require('node:path');

async function run(window, root) {
  const evaluate = (source) => window.webContents.executeJavaScript(source);
  const output = path.join(root, 'docs/assets');
  fs.mkdirSync(output, { recursive: true });
  async function waitFor(condition) {
    const end = Date.now() + 20000;
    while (Date.now() < end) {
      if (await evaluate(condition)) return;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error('Portfolio data did not finish loading');
  }
  const data = await evaluate('window.botControl.snapshot({since:0,until:Date.now()/1000+1})');
  if (data.bots.length !== 3 || !data.bots.every((bot) => bot.username.endsWith('_demo_bot'))) {
    throw new Error('Portfolio capture only accepts the isolated synthetic fixture');
  }
  await waitFor('document.querySelectorAll(".metric-card").length===4');
  if ((await evaluate('document.documentElement.lang')) !== 'en') {
    await evaluate('document.querySelector(".language-button").click()');
    await waitFor('document.documentElement.lang==="en"');
  }
  async function capture(filename) {
    // Anonymize only presentation labels in this explicit capture harness.
    await evaluate(`(() => {
      document.querySelector('.server-switch strong').textContent='BOT CONTROL LAB';
      document.querySelector('.breadcrumb span').textContent='BOT CONTROL LAB';
      document.querySelector('.eyebrow').textContent='DEMO DATA / SINGLE SERVER';
    })()`);
    await evaluate(
      'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))',
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    fs.writeFileSync(path.join(output, filename), (await window.webContents.capturePage()).toPNG());
  }
  await capture('overview.png');
  await evaluate('document.querySelector("[data-testid=nav-errors]").click()');
  await waitFor('document.querySelector(".error-row")!==null');
  await evaluate('document.querySelector(".error-row").click()');
  await waitFor('document.querySelector(".traceback pre")!==null');
  await capture('errors.png');
  console.log('Portfolio screenshots saved from synthetic data with anonymous server labels.');
}
module.exports = { run };
