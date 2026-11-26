import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

export async function checkEducation({ run, click, until, send, reopen }) {
  const state = () => run('chrome.storage.local.get(null)');
  const visible = (text) => run('document.body.innerText.includes(' + JSON.stringify(text) + ')');
  async function disclosure(name) {
    await until(() =>
      run(
        "(()=>{const s=[...document.querySelectorAll('summary')].find(s=>s.checkVisibility()&&s.textContent.trim()===" +
          JSON.stringify(name) +
          ');if(!s)return false;s.parentElement.open=true;return true})()',
      ),
    );
  }
  async function help() {
    await click('Settings');
    await disclosure('Help and tutorials');
  }
  await send('Emulation.setDeviceMetricsOverride', {
    width: 320,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });
  if (!reopen) {
    await until(() => visible('Start guided tutorial'));
    if (process.env.PKI_TUTORIAL_SCREENSHOT) {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      await writeFile(process.env.PKI_TUTORIAL_SCREENSHOT, Buffer.from(shot.data, 'base64'));
    }
    await send('Page.bringToFront');
    await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await run("document.querySelector('.tour-card button').focus()");
    await send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      key: 'Tab',
      code: 'Tab',
      windowsVirtualKeyCode: 9,
    });
    await send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Tab',
      code: 'Tab',
      windowsVirtualKeyCode: 9,
    });
    assert.equal(await run('document.activeElement?.textContent'), 'Explore demo Knowledge Space');
    await click('Start guided tutorial');
    await until(() => visible('Create a Knowledge Space'));
    await click('Show me where');
    await until(() => run("document.activeElement?.dataset.tour==='space'"));
    await run(
      "(()=>{const n=document.querySelector('#space-creation input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,'My own space');n.dispatchEvent(new Event('input',{bubbles:true}))})()",
    );
    await click('Create space');
    await until(() => visible('Step 2 of 2'));
    await click('Pause tutorial');
    await until(async () => (await state())['pki.tutorial.v1']?.status === 'paused');
    await help();
    await click('Load demo Knowledge Space');
    await until(() => visible('Python fundamentals · Demo'));
    const before = await state();
    assert.equal(before['pki.library'].spaces.length, 1);
    assert.equal(before['pki.ai.settings'], undefined);
    await click('Visiting each item');
    await disclosure('Illustrative analysis and source');
    await click('Read Keeping an ordered list');
    await disclosure('Try a sample revision item');
    await click('Compare with sample answer');
    await until(() => visible('Illustrative feedback'));
    const after = await state();
    assert.deepEqual(after, before);
    assert.equal(await run('document.documentElement.scrollWidth<=320'), true);
    await help();
    await run('window.confirm=()=>false');
    await click('Remove demo space');
    assert.equal((await state())['pki.tutorial.pythonDemo'], true);
    return;
  }
  const before = await state();
  assert.equal(before['pki.tutorial.v1'].cursor, 1);
  assert.equal(before['pki.tutorial.pythonDemo'], true);
  await help();
  await click('Resume Getting started');
  await until(() => visible('Step 2 of 2'));
  await click('Back a step');
  await until(() => visible('Step 1 of 2'));
  await click('Skip step');
  await until(() => visible('Step 2 of 2'));
  await click('Skip step');
  await until(() => visible('walkthrough finished'));
  assert.deepEqual((await state())['pki.tutorial.v1'].done, ['space']);
  await click('Close tutorial');
  await run('window.confirm=()=>true');
  await click('Remove demo space');
  await until(async () => !(await state())['pki.tutorial.pythonDemo']);
  await click('Restart onboarding');
  await until(() => visible('Explore on my own'));
  await click('Explore on my own');
  await until(async () => !(await visible('Start guided tutorial')));
  assert.deepEqual((await state())['pki.library'], before['pki.library']);
  assert.equal((await state())['pki.ai.settings'], undefined);
  await run("chrome.storage.local.set({'pki.appearance':'dark'})");
  await until(() => run("document.documentElement.dataset.theme==='dark'"));
  await help();
  await disclosure('Tutorial modules');
  await click('Connect and discover · 0/3');
  await click('Show me where');
  await until(() => run("document.activeElement?.dataset.tour==='search'"));
  assert.equal(await run('document.documentElement.scrollWidth<=320'), true);
  console.log(
    'Passed first use, keyboard entry, action detection, pause, process restart, resume/back/skip, isolated offline demo, removal, restart, personal data preservation and 320px layout.',
  );
}
