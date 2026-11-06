/* 실제 Chrome 확장 API를 사용하는 선택적 검사. 별도의 임시 프로필만 사용한다. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const { captureStoreArtwork } = require('./store-artwork.cjs');
const { waitForBrowserState } = require('./wait-for-browser-state.cjs');

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'airplane-chime-qa-'));
  const output = path.join(root, 'test-results');
  fs.mkdirSync(output, { recursive: true });
  const errors = [];
  const context = await chromium.launchPersistentContext(profile, {
    headless: process.env.HEADED !== '1',
    locale: 'en-US',
    deviceScaleFactor: 2,
    ...(process.env.CHIME_CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHIME_CHROMIUM_EXECUTABLE } : { channel: 'chromium' }),
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`, '--enable-logging=stderr']
  });
  context.setDefaultTimeout(15000);
  const logPage = page => page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') console.error('Page console:', message.text());
  });
  context.pages().forEach(logPage);
  context.on('page', logPage);
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
    console.log('Smoke: fresh popup initialized');
    assert.equal(await page.locator('#timerToggle').isChecked(), false);
    assert.equal(await page.locator('#soundOptions label').count(), 5);
    await page.locator('#testSelectedSound').click();
    await page.waitForFunction(() => /Playing|Test finished/.test(document.getElementById('soundTestStatus').textContent));
    console.log('Smoke: built-in preview started');
    await page.screenshot({ path: path.join(output, '01-first-use.png'), fullPage: true });
    await captureStoreArtwork(page, context, output, 0);

    await page.selectOption('#intervalSelect', 'custom');
    await page.fill('#customIntervalInput', '25');
    await page.locator('#customIntervalInput').press('Tab');
    await page.locator('label.switch').click();
    await page.waitForFunction(() => /Next scheduled chime/.test(document.getElementById('scheduleStatus').textContent));
    assert.equal((await getState()).customInterval, 25);
    console.log('Smoke: custom interval enabled');
    const firstAlarm = (await getAlarms()).find(x => x.name === 'chimeAlarm');
    assert.equal(firstAlarm.periodInMinutes, 25);
    await page.screenshot({ path: path.join(output, '02-custom-interval.png'), fullPage: true });
    await captureStoreArtwork(page, context, output, 1);
    await page.goto('about:blank');
    await openPopup();
    assert.equal((await getAlarms()).find(x => x.name === 'chimeAlarm').scheduledTime, firstAlarm.scheduledTime);

    // 실제 서비스 워커 → 오프스크린 문서 → 디코더 경로의 재생 시작 응답을 확인한다.
    const chimesBefore = (await getState()).chimeCount || 0;
    await control.evaluate(() => chrome.alarms.create('chimeAlarm', { when: Date.now() + 1000, periodInMinutes: 25 }));
    await waitForBrowserState(page, async before => (await chrome.storage.local.get('chimeCount')).chimeCount > before, chimesBefore, { timeout: 65000 });

    console.log('Smoke: scheduled built-in audio started');
    await page.locator('label.mode-radio').filter({ hasText: 'Dual Timer' }).click();
    await page.waitForFunction(() => /Timer 1:/.test(document.getElementById('scheduleStatus').textContent));
    const dual = await getAlarms();
    assert.equal(dual.length, 2);
    assert.deepEqual(dual.map(x => x.periodInMinutes).sort((a,b) => a-b), [15, 60]);
    await page.screenshot({ path: path.join(output, '03-dual-timer.png'), fullPage: true });
    await captureStoreArtwork(page, context, output, 2);
    await page.selectOption('#shortIntervalSelect', '20');
    await waitForBrowserState(page, async () => {
      const alarms = await chrome.alarms.getAll();
      return alarms.length === 2 && alarms.find(alarm => alarm.name === 'shortTimer')?.periodInMinutes === 20
        && alarms.find(alarm => alarm.name === 'longTimer')?.periodInMinutes === 60;
    });
    const beforeInvalid = await getAlarms();
    await page.selectOption('#longIntervalSelect', '45');
    await page.waitForFunction(() => /exact multiple/.test(document.getElementById('settingsStatus').textContent));
    assert.deepEqual(await getAlarms(), beforeInvalid);
    await page.locator('label.switch').click();
    await waitForBrowserState(page, async () => (await chrome.alarms.getAll()).length === 0);

    console.log('Smoke: dual settings, validation, and OFF checked');
    // 실제 파일 선택/저장/디코딩을 검증한다. 파일명은 의도적으로 HTML처럼 보이게 한다.
    await page.locator('label.mode-radio').filter({ hasText: 'Single Timer' }).click();
    await waitForBrowserState(page, async () => (await chrome.storage.local.get('timerMode')).timerMode === 'single');
    const samples = 800;
    const wav = Buffer.alloc(44 + samples * 2);
    wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
    for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(1000 * Math.sin(i * 2 * Math.PI * 440 / 8000)), 44 + i * 2);
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'), page.locator('#addCustomSound').click()
    ]);
    await chooser.setFiles({ name: '<img src=x onerror=alert(1)>.wav', mimeType: 'audio/wav', buffer: wav });
    await waitForBrowserState(page, async () => (await chrome.storage.local.get('customSounds')).customSounds?.length === 1);
    const uploaded = (await getState()).customSounds[0];
    assert.match(uploaded.data, /^data:audio\/wav;base64,/);
    await page.locator('label.switch').click();
    await waitForBrowserState(page, async () => (await chrome.alarms.getAll()).length === 1);
    const customChimesBefore = (await getState()).chimeCount || 0;
    await control.evaluate(() => chrome.alarms.create('chimeAlarm', { when: Date.now() + 1000, periodInMinutes: 25 }));
    await waitForBrowserState(page, async before => (await chrome.storage.local.get('chimeCount')).chimeCount > before, customChimesBefore, { timeout: 65000 });
    await page.locator('label.switch').click();
    await waitForBrowserState(page, async () => (await chrome.alarms.getAll()).length === 0);
    await control.evaluate(value => chrome.storage.local.set({ dualTimer: { shortInterval: 15, longInterval: 60, shortSound: value, longSound: value } }), uploaded.value);
    await openPopup();
    assert.equal(await page.locator('#soundOptions img').count(), 0);
    assert.ok((await page.locator('#soundOptions').textContent()).includes('<img src=x onerror=alert(1)>'));
    await page.locator('.sound-delete-btn').click();
    await waitForBrowserState(page, async () => (await chrome.storage.local.get('customSounds')).customSounds.length === 0);
    const repaired = await getState();
    assert.equal(repaired.selectedSound, 'chime1');
    assert.equal(repaired.dualTimer.shortSound, 'chime1');
    assert.equal(repaired.dualTimer.longSound, 'chime2');

    // 시각과 반복 선택은 실제 UI로 저장한다. API는 이미 예약된 알람의 발화만 앞당긴다.
    const specificTime = await page.evaluate(() => {
      const time = new Date(Date.now() + 10 * 60000);
      return `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
    });
    await page.selectOption('#intervalSelect', 'specific');
    await page.fill('#specificTimeInput', specificTime);
    await page.locator('#specificTimeInput').press('Tab');
    await page.locator('#repeatDaily').uncheck();
    await waitForBrowserState(page, async time => {
      const state = await chrome.storage.local.get(['interval', 'specificTime', 'repeatDaily']);
      return state.interval === 'specific' && state.specificTime === time && state.repeatDaily === false;
    }, specificTime);
    await page.locator('label.switch').click();
    await waitForBrowserState(page, async () => {
      const state = await chrome.storage.local.get('isActive');
      const alarm = await chrome.alarms.get('chimeAlarm');
      return state.isActive === true && alarm && alarm.periodInMinutes === undefined;
    });
    const oneShotChimesBefore = (await getState()).chimeCount || 0;
    await control.evaluate(() => chrome.alarms.create('chimeAlarm', { when: Date.now() + 1000 }));
    await waitForBrowserState(page, async before => {
      const state = await chrome.storage.local.get(['isActive', 'chimeCount']);
      return state.isActive === false && state.chimeCount > before && (await chrome.alarms.getAll()).length === 0;
    }, oneShotChimesBefore, { timeout: 65000 });
    await page.waitForFunction(() => !document.getElementById('timerToggle').checked);
    await page.goto('about:blank');
    await openPopup();
    assert.equal((await getState()).isActive, false);
    assert.equal(await page.locator('#timerToggle').isChecked(), false);
    assert.deepEqual(await getAlarms(), []);
    console.log('Smoke: one-shot audio completed, persisted OFF, and did not rearm on reopening');

    // 일일 알람은 DST/절전에 대비해 1440분 주기가 아닌 다음 현지 시각의 일회성 예약을 사용한다.
    await page.locator('#repeatDaily').check();
    await waitForBrowserState(page, async () => (await chrome.storage.local.get('repeatDaily')).repeatDaily === true);
    await page.locator('label.switch').click();
    await waitForBrowserState(page, async () => (await chrome.alarms.get('chimeAlarm'))?.scheduledTime > Date.now());
    const dailyAlarm = (await getAlarms()).find(alarm => alarm.name === 'chimeAlarm');
    assert.equal(dailyAlarm.periodInMinutes, undefined);
    const dailyChimesBefore = (await getState()).chimeCount || 0;
    await control.evaluate(() => chrome.alarms.create('chimeAlarm', { when: Date.now() + 1000 }));
    await waitForBrowserState(page, async ({ before, time }) => {
      const state = await chrome.storage.local.get(['isActive', 'chimeCount']);
      const alarm = await chrome.alarms.get('chimeAlarm');
      if (state.isActive !== true || state.chimeCount <= before || !alarm || alarm.periodInMinutes !== undefined
        || alarm.scheduledTime <= Date.now()) return false;
      const next = new Date(alarm.scheduledTime);
      return `${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}` === time;
    }, { before: dailyChimesBefore, time: specificTime }, { timeout: 65000 });
    // 앞당긴 발화는 설정한 시각 이전이므로 같은 미래 현지 시각으로 다시 예약되어야 한다.
    assert.equal((await getAlarms()).find(alarm => alarm.name === 'chimeAlarm').scheduledTime, dailyAlarm.scheduledTime);
    assert.equal(await page.locator('#timerToggle').isChecked(), true);
    await page.locator('label.switch').click();
    await waitForBrowserState(page, async () => (await chrome.alarms.getAll()).length === 0);
    console.log('Smoke: daily audio stayed ON, rearmed at the configured local time, and turned OFF cleanly');

    assert.deepEqual(errors, []);
    console.log('Browser smoke checks passed. Screenshots: ' + output);
    console.log('This verifies playback startup, not human-audible output or sleep/wake behavior.');
  } catch (error) {
    for (const [index, page] of context.pages().entries()) {
      if (page.url().startsWith('chrome-extension://')) {
        console.error('Failure page:', page.url(), await page.locator('body').innerText({ timeout: 3000 }).catch(() => 'unavailable'));
        await page.screenshot({ path: path.join(output, `failure-${index}.png`), fullPage: true }).catch(() => {});
      }
    }
    throw error;
  } finally {
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
