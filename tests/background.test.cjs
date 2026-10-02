const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

function harness(initial = {}, initialTime = '2026-10-02T10:10:00') {
  let now = new Date(initialTime).getTime();
  const data = { ...initial };
  const alarms = new Map();
  const messages = [];
  const badges = [];
  const created = [];
  let offscreenExists = false;
  let offscreenCreations = 0;
  const event = () => ({ addListener() {} });
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const chrome = {
    runtime: {
      onInstalled: event(), onStartup: event(), onMessage: event(),
      getURL: (value) => value,
      sendMessage: async (message) => { messages.push(message); },
      setUninstallURL() {}
    },
    alarms: {
      onAlarm: event(),
      clearAll: async () => { alarms.clear(); },
      get: async (name) => alarms.get(name),
      create: async (name, options) => {
        const alarm = { name, ...options, scheduledTime: options.when ?? now + options.delayInMinutes * 60000 };
        alarms.set(name, alarm);
        created.push(alarm);
      }
    },
    storage: { local: {
      get: async (keys) => {
        if (typeof keys === 'string') return { [keys]: data[keys] };
        if (Array.isArray(keys)) return Object.fromEntries(keys.map((key) => [key, data[key]]));
        return Object.fromEntries(Object.entries(keys).map(([key, fallback]) => [
          key, Object.hasOwn(data, key) ? data[key] : fallback
        ]));
      },
      set: async (update) => { Object.assign(data, update); }
    } },
    offscreen: {
      hasDocument: async () => offscreenExists,
      createDocument: async () => {
        offscreenCreations++;
        await new Promise((resolve) => setImmediate(resolve));
        if (offscreenExists) throw new Error('Only a single offscreen document may be created.');
        offscreenExists = true;
      }
    },
    action: {
      setBadgeText: async ({ text }) => badges.push(text),
      setBadgeBackgroundColor: async () => {}
    },
    tabs: { create() {} }
  };
  const context = vm.createContext({
    chrome, Date: Clock, console,
    fetch: async () => ({ json: async () => ({ sounds: [
      { value: 'chime1', filename: 'short.mp3' },
      { value: 'chime2', filename: 'long.mp3' }
    ] }) })
  });
  vm.runInContext(source, context);
  return {
    context, chrome, data, alarms, messages, badges, created,
    setTime(value) { now = new Date(value).getTime(); },
    plays: () => messages.filter((message) => message.type === 'playSound'),
    offscreenCreations: () => offscreenCreations
  };
}

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
