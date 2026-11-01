const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function run(window, root) {
  const evaluate = (source) => window.webContents.executeJavaScript(source);
  const output = path.join(root, 'desktop/test-output');
  fs.mkdirSync(output, { recursive: true });
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
  const snapshot = 'window.botControl.snapshot({since:0,until:Date.now()/1000+1})';
  const launch = 'window.botControl.launchProfile("940000001")';
  const capture = async (name) => {
    if (process.env.BOTCONTROL_PORTFOLIO === '1' && name === 'process-running.png') {
      await evaluate(`(() => {
        document.querySelector('.server-switch strong').textContent='BOT CONTROL LAB';
        document.querySelector('.breadcrumb span').textContent='BOT CONTROL LAB';
        document.querySelector('.eyebrow').textContent='DEMO DATA / COMPLEX WORKFLOW';
      })()`);
    }
    await evaluate(
      'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))',
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    fs.writeFileSync(path.join(output, name), (await window.webContents.capturePage()).toPNG());
    if (process.env.BOTCONTROL_PORTFOLIO === '1' && name === 'process-running.png') {
      fs.mkdirSync(path.join(root, 'docs/assets'), { recursive: true });
      fs.copyFileSync(path.join(output, name), path.join(root, 'docs/assets/processes.png'));
    }
  };
  await waitFor(`${snapshot}.then(data=>data.bots.some(bot=>bot.bot_id==='940000001'))`);
  assert.equal(
    (await evaluate(snapshot)).bots.length,
    1,
    'run this smoke test only in an isolated fixture directory',
  );
  try {
    await waitFor('document.querySelector("[data-testid=bot-item]") !== null');
    await evaluate('document.querySelector("[data-testid=bot-item]").click()');
    await waitFor('document.querySelector("[data-testid=bot-start]")?.disabled === false');
    await evaluate('document.querySelector("[data-testid=bot-start]").click()');
    await waitFor(
      `${snapshot}.then(data=>data.bots[0].state==='running' && data.totals.events>=4)`,
    );
    await waitFor('document.querySelector("[data-testid=bot-restart]")?.disabled === false');
    await waitFor('document.querySelector(".bot-item .state-dot.running") !== null');
    const first = await evaluate(`${launch}.then(info=>info.run.id)`);
    await capture('process-running.png');
    await evaluate('document.querySelector("[data-testid=bot-restart]").click()');
    await waitFor(
      `${launch}.then(info=>info.run.id!==${JSON.stringify(first)} && info.run.status==='running')`,
    );
    await waitFor(`${snapshot}.then(data=>data.bots[0].state==='running')`);
    await waitFor('document.querySelector("[data-testid=bot-stop]")?.disabled === false');
    await evaluate('document.querySelector("[data-testid=bot-stop]").click()');
    await waitFor('document.querySelector("[data-testid=bot-start]")?.disabled === false');
    assert.equal((await evaluate(snapshot)).bots[0].state, 'stopped');
    assert.equal(await evaluate(`${launch}.then(info=>info.run.status)`), 'stopped');
    await evaluate('document.querySelector(".configure-launch").click()');
    await waitFor('document.querySelector("[data-testid=launch-command]") !== null');
    const command = await evaluate('document.querySelector("[data-testid=launch-command]").value');
    assert.match(command, /--config/);
    assert.match(command, /complex_aiogram_bot/);
    await capture('process-profile.png');
    console.log(
      'CONTROL_SMOKE_OK: real UI Start → running → Restart → new launch → Stop, complex module, preparation, env file and saved profile.',
    );
  } finally {
    await evaluate('window.botControl.controlBot("940000001","stop",true).catch(()=>null)');
  }
}

module.exports = { run };
