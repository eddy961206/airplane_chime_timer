const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/background-harness.cjs');

const dual = {
  isActive: true, timerMode: 'dual',
  dualTimer: { shortInterval: 15, longInterval: 90, shortSound: 'chime1', longSound: 'chime2' }
};

test('dual timers play the long chime once at an overlap, in either event order', async () => {
  for (const order of [['shortTimer', 'longTimer'], ['longTimer', 'shortTimer']]) {
    const h = harness(dual);
    await h.context.createDualTimerAlarm(dual.dualTimer);
    const due = h.alarms.get('longTimer').scheduledTime;
    // 브라우저가 반복 알람을 다음 시각으로 갱신한 상태에서도 겹침을 판단해야 한다.
    h.alarms.get('longTimer').scheduledTime += 90 * 60000;
    h.setTime('2026-10-02T11:37:00');
    for (const name of order) await h.context.handleAlarm({ name, scheduledTime: due });
    assert.deepEqual(h.plays().map((message) => message.filename), ['long.mp3']);
    assert.equal(h.data.chimeCount, 1);
  }
});

test('90 minute dual timer keeps its short sound at 11:00 when the long alarm is due at 11:30', async () => {
  const h = harness(dual);
  await h.context.createDualTimerAlarm(dual.dualTimer);
  h.setTime('2026-10-02T11:00:00');
  await h.context.handleAlarm({ name: 'shortTimer', scheduledTime: new Date('2026-10-02T11:00:00').getTime() });
  assert.deepEqual(h.plays().map((message) => message.filename), ['short.mp3']);
});

test('sleep-shifted recurring alarms still play only the long sound in either event order', async () => {
  for (const order of [['shortTimer', 'longTimer'], ['longTimer', 'shortTimer']]) {
    const h = harness(dual);
    await h.context.createDualTimerAlarm(dual.dualTimer);
    const due = h.alarms.get('longTimer').scheduledTime;
    h.setTime('2026-10-02T12:07:00');
    h.alarms.get('longTimer').scheduledTime = new Date('2026-10-02T13:37:00').getTime();
    for (const name of order) await h.context.handleAlarm({ name, scheduledTime: due });
    assert.deepEqual(h.plays().map((message) => message.filename), ['long.mp3']);
    // 절전 이후의 새 주기에서도 긴 예약의 중복 없이 짧은 소리를 유지한다.
    await h.context.handleAlarm({ name: 'shortTimer', scheduledTime: new Date('2026-10-02T12:22:00').getTime() });
    assert.deepEqual(h.plays().map((message) => message.filename), ['long.mp3', 'short.mp3']);
  }
});

test('waking after both timers were missed coalesces the backlog into one long sound', async () => {
  for (const order of [['shortTimer', 'longTimer'], ['longTimer', 'shortTimer']]) {
    const h = harness(dual);
    await h.context.createDualTimerAlarm(dual.dualTimer);
    const due = h.alarms.get('longTimer').scheduledTime;
    const shortDue = new Date('2026-10-02T10:15:00').getTime();
    h.setTime('2026-10-02T12:07:00');
    h.alarms.get('longTimer').scheduledTime = new Date('2026-10-02T13:37:00').getTime();
    for (const name of order) await h.context.handleAlarm({ name, scheduledTime: name === 'longTimer' ? due : shortDue });
    assert.deepEqual(h.plays().map((message) => message.filename), ['long.mp3']);
  }
});

test('one-shot completion persists OFF and cannot rearm on browser startup', async () => {
  const h = harness({ isActive: true, interval: 'specific', specificTime: '11:00', repeatDaily: false });
  await h.context.createSingleAlarm(await h.context.loadSettings());
  const alarm = h.alarms.get('chimeAlarm');
  h.alarms.delete('chimeAlarm');
  h.setTime('2026-10-02T11:00:00');
  await h.context.handleAlarm(alarm);
  assert.equal(h.data.isActive, false);
  assert.equal(h.badges.at(-1), 'OFF');
  h.setTime('2026-10-02T11:01:00');
  await h.context.handleStartup();
  assert.equal(h.alarms.size, 0);
  assert.equal(h.created.length, 1);
});

test('startup preserves the scheduled time of an existing custom interval alarm', async () => {
  const h = harness({ isActive: true, interval: 'custom', customInterval: 90 });
  const scheduledTime = new Date('2026-10-02T11:30:00').getTime();
  h.alarms.set('chimeAlarm', { name: 'chimeAlarm', scheduledTime, periodInMinutes: 90 });
  h.setTime('2026-10-02T11:15:00');
  await h.context.handleStartup();
  assert.equal(h.alarms.get('chimeAlarm').scheduledTime, scheduledTime);
  assert.equal(h.created.length, 0);
});

test('daily specific alarms keep the configured local time after waking late', async () => {
  const h = harness({ isActive: true, interval: 'specific', specificTime: '09:00', repeatDaily: true }, '2026-10-02T08:00:00');
  await h.context.createSingleAlarm(await h.context.loadSettings());
  const alarm = h.alarms.get('chimeAlarm');
  assert.equal(alarm.periodInMinutes, undefined);
  h.setTime('2026-10-02T11:07:00');
  await h.context.handleAlarm(alarm);
  assert.equal(h.alarms.get('chimeAlarm').scheduledTime, new Date('2026-10-03T09:00:00').getTime());
  assert.equal(h.data.isActive, true);
});

test('daily alarms migrate the old 1440 minute schedule and survive daylight saving changes', async () => {
  const previousTZ = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    const h = harness({ isActive: true, interval: 'specific', specificTime: '09:00', repeatDaily: true }, '2026-10-31T09:00:00');
    const oldDue = new Date('2026-10-31T09:00:00').getTime();
    h.alarms.set('chimeAlarm', { name: 'chimeAlarm', scheduledTime: oldDue + 1440 * 60000, periodInMinutes: 1440 });
    h.setTime('2026-11-01T07:00:00');
    await h.context.handleStartup();
    assert.equal(h.alarms.get('chimeAlarm').scheduledTime, new Date('2026-11-01T09:00:00').getTime());
    h.setTime('2026-11-01T09:00:00');
    await h.context.handleAlarm(h.alarms.get('chimeAlarm'));
    assert.equal(h.alarms.get('chimeAlarm').scheduledTime, new Date('2026-11-02T09:00:00').getTime());
  } finally {
    if (previousTZ === undefined) delete process.env.TZ;
    else process.env.TZ = previousTZ;
  }
});

test('startup recreates missing alarms for an active timer', async () => {
  const h = harness({ isActive: true, interval: '15' });
  await h.context.handleStartup();
  assert.equal(h.alarms.get('chimeAlarm').periodInMinutes, 15);
});

test('editing an inactive timer does not create any alarm', async () => {
  const h = harness({ isActive: false });
  await h.context.handleMessage({ action: 'updateAlarm', interval: '30' });
  assert.equal(h.alarms.size, 0);
});

test('single timer settings cannot replace an active dual schedule', async () => {
  const h = harness(dual);
  await h.context.createDualTimerAlarm(dual.dualTimer);
  await h.context.handleMessage({ action: 'updateAlarm', interval: '30' });
  assert.deepEqual([...h.alarms.keys()], ['shortTimer', 'longTimer']);
});

test('concurrent requests create only one offscreen document', async () => {
  const h = harness();
  await Promise.all([h.context.ensureOffscreenDocument(), h.context.ensureOffscreenDocument()]);
  assert.equal(h.offscreenCreations(), 1);
});

test('an OFF change during a pending ON operation leaves no alarm or ON badge', async () => {
  const h = harness({ isActive: true });
  let release;
  let entered;
  const pending = new Promise((resolve) => { entered = resolve; });
  const clear = h.chrome.alarms.clearAll;
  let first = true;
  h.chrome.alarms.clearAll = async () => {
    if (first) {
      first = false;
      entered();
      await new Promise((resolve) => { release = resolve; });
    }
    await clear();
  };
  const turnOn = h.context.handleMessage({ type: 'toggleTimer', isActive: true });
  await pending;
  h.data.isActive = false;
  const turnOff = h.context.handleMessage({ type: 'toggleTimer', isActive: false });
  release();
  await Promise.all([turnOn, turnOff]);
  assert.equal(h.alarms.size, 0);
  assert.equal(h.badges.at(-1), 'OFF');
});

test('scheduled playback retains zero volume', async () => {
  const h = harness({ isActive: true, volume: 0 });
  await h.context.handleAlarm({ name: 'chimeAlarm', scheduledTime: Date.now() });
  assert.equal(h.plays()[0].volume, 0);
});


test('runtime messages require a trusted extension page and valid schema', async () => {
  const h = harness({ isActive: true });
  for (const sender of [undefined, {}, { id: 'another-extension', url: h.chrome.runtime.getURL('popup.html') },
    { id: h.chrome.runtime.id, url: 'https://example.com/' },
    { id: h.chrome.runtime.id, url: h.chrome.runtime.getURL('audio-player.html') }]) {
    const replies = [];
    h.chrome.runtime.onMessage.listeners[0]({ type: 'toggleTimer', isActive: true }, sender, (reply) => replies.push(reply));
    assert.equal(replies[0].ok, false);
  }
  assert.equal((await h.dispatch({ type: 'toggleTimer', isActive: 'true' })).ok, false);
  assert.equal(h.created.length, 0);
  assert.equal((await h.dispatch({ type: 'toggleTimer', isActive: true })).ok, true);
  assert.equal(h.created.length, 1);
});

test('runtime listener ignores unrelated notifications without stealing their response', () => {
  const h = harness();
  for (const message of [null, undefined, [], 'playSound', { type: 'playSound' }, { type: 'updateNextChimeTime' }]) {
    let replied = false;
    const result = h.chrome.runtime.onMessage.listeners[0](message, {}, () => { replied = true; });
    assert.equal(result, false);
    assert.equal(replied, false);
  }
});

test('invalid single settings are rejected before deleting an existing schedule', async () => {
  const h = harness({ isActive: true });
  await h.context.handleStartup();
  const original = h.alarms.get('chimeAlarm');
  for (const settings of [
    { interval: 'specific', specificTime: '' },
    { interval: 'specific', specificTime: '24:00' },
    { interval: 'specific', specificTime: '12:60' },
    { interval: 'specific', specificTime: '1:00' },
    { interval: 'custom', customInterval: 0 },
    { interval: 'custom', customInterval: 1441 },
    { interval: 'custom', customInterval: 1.5 },
    { interval: '15trailing' }
  ]) {
    await assert.rejects(h.context.createSingleAlarm(settings));
    assert.equal(h.alarms.get('chimeAlarm'), original);
  }
});

test('invalid dual settings are rejected before deleting an existing schedule', async () => {
  const h = harness({ isActive: true });
  await h.context.handleStartup();
  const original = h.alarms.get('chimeAlarm');
  for (const config of [null, {}, { ...dual.dualTimer, shortInterval: 30, longInterval: 15 },
    { ...dual.dualTimer, shortInterval: 15, longInterval: 20 },
    { ...dual.dualTimer, longInterval: 1500 }, { ...dual.dualTimer, shortSound: null }]) {
    await assert.rejects(h.context.createDualTimerAlarm(config));
    assert.equal(h.alarms.get('chimeAlarm'), original);
  }
});

test('queued setting messages use the latest saved settings', async () => {
  const h = harness({ isActive: true, interval: '30' });
  await h.context.handleMessage({ action: 'updateAlarm', interval: '15' });
  assert.equal(h.alarms.get('chimeAlarm').periodInMinutes, 30);
  h.data.isActive = false;
  await h.context.handleMessage({ type: 'toggleTimer', isActive: true });
  assert.equal(h.alarms.size, 0);
  assert.equal(h.badges.at(-1), 'OFF');
});

test('dual sound-only edits keep the current alarm phase', async () => {
  const h = harness(dual);
  await h.context.handleStartup();
  const shortDue = h.alarms.get('shortTimer').scheduledTime;
  const longDue = h.alarms.get('longTimer').scheduledTime;
  h.setTime('2026-10-02T10:16:00');
  h.data.dualTimer = { ...dual.dualTimer, shortSound: 'chime2' };
  await h.context.handleMessage({ type: 'updateDualTimer', dualTimer: h.data.dualTimer });
  assert.equal(h.alarms.get('shortTimer').scheduledTime, shortDue);
  assert.equal(h.alarms.get('longTimer').scheduledTime, longDue);
  assert.equal(h.created.length, 2);
});

test('syncTimer repairs a missing or outdated schedule without resetting a matching one', async () => {
  const h = harness({ isActive: true, interval: '30' });
  assert.equal((await h.dispatch({ type: 'syncTimer' })).ok, true);
  const due = h.alarms.get('chimeAlarm').scheduledTime;
  h.setTime('2026-10-02T10:16:00');
  await h.dispatch({ type: 'syncTimer' });
  assert.equal(h.alarms.get('chimeAlarm').scheduledTime, due);
  assert.equal(h.created.length, 1);
  h.data.interval = '60';
  await h.dispatch({ type: 'syncTimer' });
  assert.equal(h.alarms.get('chimeAlarm').periodInMinutes, 60);
  h.alarms.clear();
  await h.dispatch({ type: 'syncTimer' });
  assert.equal(h.alarms.size, 1);
});

test('alarm scheduling retries a transient failure and returns a success acknowledgment', async () => {
  const h = harness({ isActive: true });
  const create = h.chrome.alarms.create;
  let attempts = 0;
  h.chrome.alarms.create = async (...args) => {
    if (++attempts === 1) throw new Error('Transient scheduling failure');
    return create(...args);
  };
  assert.equal((await h.dispatch({ type: 'toggleTimer', isActive: true })).ok, true);
  assert.equal(attempts, 2);
  assert.equal(h.alarms.size, 1);
});

test('persistent dual scheduling failure returns an error and removes partial alarms', async () => {
  const h = harness(dual);
  const create = h.chrome.alarms.create;
  h.chrome.alarms.create = async (name, options) => {
    if (name === 'longTimer') throw new Error('Unable to create second timer');
    return create(name, options);
  };
  const response = await h.dispatch({ type: 'toggleTimer', isActive: true });
  assert.equal(response.ok, false);
  assert.match(response.error, /Unable to create second timer/);
  assert.equal(h.alarms.size, 0);
  assert.equal(h.badges.at(-1), 'OFF');
});

test('failed or unacknowledged audio is never counted as a successful chime', async () => {
  for (const response of [undefined, { ok: false, error: 'Audio cannot be decoded' }]) {
    const h = harness({ isActive: true });
    h.chrome.runtime.sendMessage = async () => response;
    await h.context.handleAlarm({ name: 'chimeAlarm', scheduledTime: Date.now() });
    assert.equal(h.data.chimeCount, undefined);
  }
});

test('offscreen first-use delivery retries only missing-receiver failures', async () => {
  const h = harness();
  let attempts = 0;
  h.chrome.runtime.sendMessage = async () => {
    if (++attempts === 1) throw new Error('Could not establish connection. Receiving end does not exist.');
    return { ok: true };
  };
  assert.equal(await h.context.playSound('chime1', 50), true);
  assert.equal(attempts, 2);
  assert.equal(h.offscreenCreations(), 1);

  attempts = 0;
  h.chrome.runtime.sendMessage = async () => {
    attempts++;
    throw new Error('The message port closed before a response was received.');
  };
  await assert.rejects(h.context.playSound('chime1', 50), /message port closed/);
  assert.equal(attempts, 1, 'An uncertain delivery must not duplicate playback');
});

test('malformed custom sound storage and invalid identifiers do not create an audio document', async () => {
  const h = harness({ customSounds: {} });
  for (const sound of [null, {}, 5, 'custom_missing']) assert.equal(await h.context.playSound(sound, 50), false);
  assert.equal(h.offscreenCreations(), 0);
});
