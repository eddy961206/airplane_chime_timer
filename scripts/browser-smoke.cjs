/* 실제 Chrome 확장 API를 사용하는 선택적 검사. 별도의 임시 프로필만 사용한다. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'airplane-chime-qa-'));
  const output = path.join(root, 'test-results');
  fs.mkdirSync(output, { recursive: true });
  const errors = [];
  const context = await chromium.launchPersistentContext(profile, {
    headless: process.env.HEADED !== '1',
    locale: 'en-US',
    ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : { channel: 'chromium' }),
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`, '--enable-logging=stderr']
  });
  try {
    let worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 10000 }).catch(() => null);
    let workerURL = worker?.url();
    if (!workerURL) {
      // MV3 워커가 먼저 시작되어 Playwright 이벤트를 놓친 경우 실제 CDP 타깃에서 식별한다.
      const cdp = await context.browser().newBrowserCDPSession();
      const { targetInfos } = await cdp.send('Target.getTargets');
      workerURL = targetInfos.find(target => target.type === 'service_worker' && target.url.startsWith('chrome-extension://'))?.url;
      await cdp.detach();
      if (!workerURL) {
        const diagnostics = await context.newPage();
        await diagnostics.goto('chrome://extensions/');
        await diagnostics.screenshot({ path: path.join(output, '00-extension-load-failure.png'), fullPage: true });
        console.error('Browser targets:', targetInfos.map(target => ({ type: target.type, url: target.url })));
        throw new Error('The extension service worker did not start. See browser logs and extension-load screenshot.');
      }
    }
    const extension = workerURL.replace(/background\.js$/, '');
    // 저장/알람 검사는 실제 확장 페이지 API를 사용해 워커의 유휴 종료와 검사 도구를 분리한다.
    const control = await context.newPage();
    await control.goto(extension + 'welcome.html');
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const openPopup = async () => {
      await page.goto(extension + 'popup.html');
      await page.waitForFunction(() => !document.getElementById('timerToggle').disabled);
      await page.waitForFunction(() => document.getElementById('scheduleStatus').textContent.length > 0);
      assert.equal(await page.locator('#settingsStatus').textContent(), '');
    };
    const getState = () => control.evaluate(() => chrome.storage.local.get(null));
    const getAlarms = () => control.evaluate(() => chrome.alarms.getAll());
    await openPopup();
    assert.equal(await page.locator('#timerToggle').isChecked(), false);
    assert.equal(await page.locator('#soundOptions label').count(), 5);
    await page.locator('#testSelectedSound').click();
    await page.waitForFunction(() => /Playing|Test finished/.test(document.getElementById('soundTestStatus').textContent));
    await page.screenshot({ path: path.join(output, '01-first-use.png'), fullPage: true });

    await page.selectOption('#intervalSelect', 'custom');
    await page.fill('#customIntervalInput', '25');
    await page.locator('#customIntervalInput').press('Tab');
    await page.locator('label.switch').click();
    await page.waitForFunction(() => /Next scheduled chime/.test(document.getElementById('scheduleStatus').textContent));
    assert.equal((await getState()).customInterval, 25);
    const firstAlarm = (await getAlarms()).find(x => x.name === 'chimeAlarm');
    assert.equal(firstAlarm.periodInMinutes, 25);
    await page.screenshot({ path: path.join(output, '02-custom-interval.png'), fullPage: true });
    await page.goto('about:blank');
    await openPopup();
    assert.equal((await getAlarms()).find(x => x.name === 'chimeAlarm').scheduledTime, firstAlarm.scheduledTime);

    // 실제 서비스 워커 → 오프스크린 문서 → 디코더 경로의 재생 시작 응답을 확인한다.
    const chimesBefore = (await getState()).chimeCount || 0;
    await control.evaluate(() => chrome.alarms.create('chimeAlarm', { when: Date.now() + 1000, periodInMinutes: 25 }));
    await page.waitForFunction(async before => (await chrome.storage.local.get('chimeCount')).chimeCount > before, chimesBefore, { timeout: 65000 });

    await page.locator('label.mode-radio').filter({ hasText: 'Dual Timer' }).click();
    await page.waitForFunction(() => /Timer 1:/.test(document.getElementById('scheduleStatus').textContent));
    const dual = await getAlarms();
    assert.equal(dual.length, 2);
    assert.deepEqual(dual.map(x => x.periodInMinutes).sort((a,b) => a-b), [15, 60]);
    await page.screenshot({ path: path.join(output, '03-dual-timer.png'), fullPage: true });
    await page.selectOption('#shortIntervalSelect', '20');
    await page.waitForFunction(async () => {
      const alarms = await chrome.alarms.getAll();
      return alarms.length === 2 && alarms.find(alarm => alarm.name === 'shortTimer')?.periodInMinutes === 20
        && alarms.find(alarm => alarm.name === 'longTimer')?.periodInMinutes === 60;
    });
    const beforeInvalid = await getAlarms();
    await page.selectOption('#longIntervalSelect', '45');
    await page.waitForFunction(() => /exact multiple/.test(document.getElementById('settingsStatus').textContent));
    assert.deepEqual(await getAlarms(), beforeInvalid);
    await page.locator('label.switch').click();
    await page.waitForFunction(async () => (await chrome.alarms.getAll()).length === 0);

    // 악성 모양의 파일명도 새 HTML 요소를 만들 수 없어야 한다.
    await control.evaluate(() => chrome.storage.local.set({ timerMode: 'single', selectedSound: 'custom_qa', customSounds: [
      { value: 'custom_qa', name: '<img src=x onerror=alert(1)>', filename: 'qa.wav', data: 'data:audio/wav;base64,UklGRg==' }
    ], dualTimer: { shortInterval: 15, longInterval: 60, shortSound: 'custom_qa', longSound: 'custom_qa' } }));
    await openPopup();
    assert.equal(await page.locator('#soundOptions img').count(), 0);
    assert.ok((await page.locator('#soundOptions').textContent()).includes('<img src=x onerror=alert(1)>'));
    await page.locator('.sound-delete-btn').click();
    await page.waitForFunction(async () => (await chrome.storage.local.get('customSounds')).customSounds.length === 0);
    const repaired = await getState();
    assert.equal(repaired.selectedSound, 'chime1');
    assert.equal(repaired.dualTimer.shortSound, 'chime1');
    assert.equal(repaired.dualTimer.longSound, 'chime2');
    assert.deepEqual(errors, []);
    console.log('Browser smoke checks passed. Screenshots: ' + output);
    console.log('This verifies playback startup, not human-audible output or sleep/wake behavior.');
  } finally {
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
