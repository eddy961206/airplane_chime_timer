const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'onboarding.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

function element(id, dataset = {}) {
  return { id, dataset, textContent: '', value: '', hidden: false, checked: false, disabled: false, attrs: {}, listeners: {},
    setAttribute(name, value) { this.attrs[name] = value; },
    addEventListener(type, fn) { this.listeners[type] = fn; }
  };
}
async function fixture({ state = {}, alarms = [], locale = 'en-US', welcome = false, failAudio = false } = {}) {
  const html = fs.readFileSync(path.join(root, welcome ? 'welcome.html' : 'popup.html'), 'utf8');
  const ids = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(m => [m[1], element(m[1])]));
  if (ids.volumeSlider) ids.volumeSlider.value = '50';
  const keys = [...html.matchAll(/data-guide-key="([^"]+)"/g)].map(m => element('', { guideKey: m[1] }));
  const languages = ['en', 'ko'].map(guideLanguage => element('', { guideLanguage }));
  const oldStatus = element('oldStatus');
  const doc = { documentElement: {}, events: {},
    getElementById(id) { return ids[id] || null; },
    querySelector() { return oldStatus; },
    querySelectorAll(selector) { return selector === '[data-guide-key]' ? keys : languages; },
    addEventListener(name, fn) { this.events[name] = fn; }
  };
  const storageListeners = [], messageListeners = [], writes = [], sounds = [];
  const store = { ...state };
  const chrome = {
    storage: {
      local: {
        async get(defaults) {
          if (typeof defaults === 'string') return { [defaults]: store[defaults] };
          return { ...defaults, ...store };
        },
        async set(values) {
          writes.push(values);
          const changes = Object.fromEntries(Object.entries(values).map(([key, newValue]) => [key, { oldValue: store[key], newValue }]));
          Object.assign(store, values);
          storageListeners.forEach(fn => fn(changes, 'local'));
        }
      },
      onChanged: { addListener(fn) { storageListeners.push(fn); } }
    },
    alarms: { async getAll() { return alarms; } },
    runtime: { getURL(value) { return 'chrome-extension://test/' + value; }, onMessage: { addListener(fn) { messageListeners.push(fn); } } }
  };
  if (welcome) delete chrome.alarms;
  const window = { setInterval(fn) { this.refresh = fn; return 1; }, clearInterval() {}, addEventListener() {} };
  class Audio {
    constructor(source) { this.source = source; this.events = {}; sounds.push(this); }
    pause() { this.paused = true; }
    addEventListener(name, fn) { this.events[name] = fn; }
    async play() { if (failAudio) throw new Error('playback denied'); this.played = true; }
  }
  const fetch = async () => ({ json: async () => JSON.parse(fs.readFileSync(path.join(root, 'sounds/sounds.json'), 'utf8')) });
  vm.runInNewContext(script, { document: doc, navigator: { language: locale }, chrome, window, Audio, fetch, console: { warn() {} } });
  doc.events.DOMContentLoaded();
  await tick();
  return { ids, doc, keys, languages, oldStatus, store, writes, sounds, chrome, window, messageListeners,
    async click(id) { ids[id].listeners.click(); await tick(); },
    async language(value) { await languages.find(x => x.dataset.guideLanguage === value).listeners.click(); await tick(); },
    async set(values) { await chrome.storage.local.set(values); await tick(); }
  };
}

test('fresh popup shows OFF, preserves old DOM hidden, does not create or mutate settings', async () => {
  const f = await fixture();
  assert.match(f.ids.scheduleStatus.textContent, /^OFF/);
  assert.equal(f.oldStatus.hidden, true);
  assert.equal(f.ids.scheduleStatus.hidden, false);
  assert.equal(f.ids.testLongSound.hidden, true);
  assert.equal(f.writes.length, 0);
  assert.ok(f.keys.every(x => typeof x.textContent === 'string' && x.textContent.length));
});
test('active single timer reads actual alarm rather than recalculating from interval', async () => {
  const scheduledTime = Date.now() + 95 * 60_000;
  const f = await fixture({ state: { isActive: true, interval: 'custom', customInterval: 90 }, alarms: [{ name: 'chimeAlarm', scheduledTime }] });
  const expected = new Date(scheduledTime).toLocaleString('en', { ...(new Date(scheduledTime).toDateString() === new Date().toDateString() ? {} : {month:'short',day:'numeric'}), hour: '2-digit', minute: '2-digit' });
  assert.equal(f.ids.scheduleStatus.textContent, 'Next scheduled chime: ' + expected);
});
test('enabled without an actual alarm shows recovery instructions', async () => {
  const f = await fixture({ state: { isActive: true } });
  assert.match(f.ids.scheduleStatus.textContent, /^No chime scheduled/);
});
test('dual mode shows actual alarms separately and previews both saved sounds', async () => {
  const f = await fixture({ state: { isActive: true, timerMode: 'dual', dualTimer: { shortSound: 'chime1', longSound: 'chime2' } }, alarms: [
    { name: 'shortTimer', scheduledTime: Date.now() + 10 * 60_000 },
    { name: 'longTimer', scheduledTime: Date.now() + 40 * 60_000 }
  ] });
  assert.match(f.ids.scheduleStatus.textContent, /^Timer 1: .+\nTimer 2: .+/);
  assert.equal(f.ids.testLongSound.hidden, false);
  await f.click('testSelectedSound');
  await f.click('testLongSound');
  assert.match(f.sounds[0].source, /one-chime/);
  assert.match(f.sounds[1].source, /ding-dong/);
});
test('one-shot completion from background updates visible toggle and OFF status', async () => {
  const f = await fixture({ state: { isActive: true } });
  f.ids.timerToggle.checked = true;
  await f.set({ isActive: false });
  assert.equal(f.ids.timerToggle.checked, false);
  assert.match(f.ids.scheduleStatus.textContent, /^OFF/);
});
test('Korean browser defaults to Korean and language toggle persists preference only', async () => {
  const f = await fixture({ locale: 'ko-KR' });
  assert.equal(f.doc.documentElement.lang, 'ko');
  assert.match(f.ids.scheduleStatus.textContent, /^꺼짐/);
  await f.language('en');
  assert.equal(f.doc.documentElement.lang, 'en');
  assert.equal(f.store.guideLanguage, 'en');
  assert.equal(f.writes.length, 1);
  assert.deepEqual(Object.keys(f.writes[0]), ['guideLanguage']);
});
test('saved language overrides browser language and guide runs without alarm API', async () => {
  const f = await fixture({ welcome: true, locale: 'en-US', state: { guideLanguage: 'ko' } });
  assert.equal(f.doc.documentElement.lang, 'ko');
  assert.ok(f.keys.every(x => x.textContent.length > 0));
  assert.match(f.keys.find(x => x.dataset.guideKey === 'focusBody').textContent, /자동으로 번갈아 실행하지는 않아/);
});
test('zero-volume test explains silence and does not claim playback', async () => {
  const f = await fixture();
  f.ids.volumeSlider.value = '0';
  await f.click('testSelectedSound');
  assert.match(f.ids.soundTestStatus.textContent, /Volume is 0%/);
  assert.equal(f.sounds.length, 0);
  assert.equal(f.ids.testSelectedSound.disabled, false);
});
test('built-in sound test honors selected sound and current volume without enabling timer', async () => {
  const f = await fixture({ state: { selectedSound: 'chime2', isActive: false } });
  f.ids.volumeSlider.value = '35';
  await f.click('testSelectedSound');
  assert.match(f.sounds[0].source, /ding-dong/);
  assert.equal(f.sounds[0].volume, .35);
  assert.equal(f.sounds[0].played, true);
  assert.equal(f.store.isActive, false);
  assert.match(f.ids.soundTestStatus.textContent, /^Playing/);
  f.sounds[0].events.ended();
  assert.match(f.ids.soundTestStatus.textContent, /^Test finished. If you heard it/);
});
test('custom sound test uses stored audio data and failure never says success', async () => {
  const f = await fixture({ state: { selectedSound: 'custom_1', customSounds: [{ value: 'custom_1', data: 'data:audio/wav;base64,UklGRg==' }] }, failAudio: true });
  await f.click('testSelectedSound');
  assert.equal(f.sounds[0].source, 'data:audio/wav;base64,UklGRg==');
  assert.match(f.ids.soundTestStatus.textContent, /^Could not play/);
  assert.equal(f.ids.testSelectedSound.disabled, false);
});
test('missing custom sound shows actionable playback error', async () => {
  const f = await fixture({ state: { selectedSound: 'custom_missing' } });
  await f.click('testSelectedSound');
  assert.match(f.ids.soundTestStatus.textContent, /^Could not play/);
  assert.equal(f.sounds.length, 0);
});
test('future-day schedules include the date', async () => {
  const scheduledTime = Date.now() + 24 * 60 * 60_000;
  const f = await fixture({ state: { isActive: true }, alarms: [{ name: 'chimeAlarm', scheduledTime }] });
  const expected = new Date(scheduledTime).toLocaleString('en', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
  assert.equal(f.ids.scheduleStatus.textContent, 'Next scheduled chime: ' + expected);
});
