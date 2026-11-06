const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'audio-player.js'), 'utf8');

function harness() {
  let listener;
  const events = {};
  const windowEvents = {};
  const createdUrls = [];
  const revokedUrls = [];
  const timers = new Map();
  let nextTimer = 1;
  const player = {
    src: '', volume: 1, ended: false, error: null, plays: 0, pauses: 0,
    play: async function () { this.plays++; },
    pause() { this.pauses++; },
    load() { this.ended = false; this.error = null; },
    removeAttribute(name) { if (name === 'src') this.src = ''; },
    addEventListener(name, callback) { events[name] = callback; }
  };
  const runtime = {
    id: 'test-extension',
    getURL: (value) => `chrome-extension://test-extension/${value}`,
    onMessage: { addListener(callback) { listener = callback; } }
  };
  const context = vm.createContext({
    document: { getElementById: () => player },
    chrome: { runtime },
    window: { addEventListener(name, callback) { windowEvents[name] = callback; } },
    Blob, Uint8Array, atob, console,
    URL: {
      createObjectURL(blob) {
        const url = `blob:audio-${createdUrls.length + 1}`;
        createdUrls.push({ url, blob });
        return url;
      },
      revokeObjectURL(url) { revokedUrls.push(url); }
    },
    setTimeout(callback) { const id = nextTimer++; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  vm.runInContext(source, context);
  return {
    player, runtime, createdUrls, revokedUrls, timers, events, windowEvents,
    send(message, sender = { id: runtime.id, url: runtime.getURL('background.js') }) {
      return new Promise((resolve) => {
        if (!listener(message, sender, resolve)) resolve(undefined);
      });
    }
  };
}

const bundled = { type: 'playSound', filename: 'chime.mp3', volume: 50, isCustomSound: false, soundUrl: '' };
const custom = { ...bundled, isCustomSound: true, soundUrl: 'data:audio/mpeg;base64,AQIDBA==' };
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('bundled audio plays at zero volume and acknowledges actual startup', async () => {
  const h = harness();
  const response = await h.send({ ...bundled, filename: 'Airbus AP Disconnect Warning.m4a', volume: 0 });
  assert.equal(response.ok, true);
  assert.equal(h.player.src, h.runtime.getURL('sounds/Airbus%20AP%20Disconnect%20Warning.m4a'));
  assert.equal(h.player.volume, 0);
  assert.equal(h.player.plays, 1);
  assert.equal(h.timers.size, 0);
});

test('audio messages reject untrusted senders and ignore unrelated messages', async () => {
  const h = harness();
  for (const sender of [{}, { id: 'other' },
    { id: h.runtime.id, url: 'https://example.com/' },
    { id: h.runtime.id, url: h.runtime.getURL('popup.html') },
    { id: h.runtime.id, tab: { id: 1 } }]) {
    assert.equal((await h.send(bundled, sender)).ok, false);
  }
  for (const message of [null, [], 'playSound', { type: 'toggleTimer' }]) {
    assert.equal(await h.send(message), undefined);
  }
  assert.equal(h.player.plays, 0);
  // Chrome가 서비스 워커 URL을 생략하는 경우에도 확장 ID와 탭 여부를 검증한다.
  assert.equal((await h.send(bundled, { id: h.runtime.id })).ok, true);
});

test('malformed volume, sound type, and bundled paths cannot start playback', async () => {
  const h = harness();
  const invalidMessages = [
    ...[undefined, null, NaN, Infinity, -1, 101, '50'].map((volume) => ({ ...bundled, volume })),
    { ...bundled, isCustomSound: 'false' },
    ...['', '../private.mp3', 'a/b.mp3', 'a\\b.mp3', '%2e%2e%2fsecret.mp3',
      'https://example.com/audio.mp3', 'file.mp3?query', 'file.mp3#fragment', 'file\0.mp3', 'page.html'
    ].map((filename) => ({ ...bundled, filename }))
  ];
  for (const message of invalidMessages) assert.equal((await h.send(message)).ok, false);
  assert.equal(h.player.plays, 0);
  assert.equal(h.createdUrls.length, 0);
});

test('custom audio requires bounded audio-only base64 data', async () => {
  const h = harness();
  for (const soundUrl of [null, '', 'https://example.com/a.mp3', 'data:text/html;base64,AQIDBA==',
    'data:audio/mpeg,AQIDBA==', 'data:audio/mpeg;base64,', 'data:audio/mpeg;base64,??==',
    'data:audio/mpeg;base64,AQIDBA=', 'data:audio/mpeg;base64,AQ IDBA==',
    `data:audio/mpeg;base64,${Buffer.alloc(1024 * 1024 + 1).toString('base64')}`
  ]) {
    assert.equal((await h.send({ ...custom, soundUrl })).ok, false);
  }
  assert.equal(h.player.plays, 0);
  assert.equal(h.createdUrls.length, 0);
});

test('custom URLs remain valid during playback and are released after ending', async () => {
  const h = harness();
  assert.equal((await h.send(custom)).ok, true);
  assert.equal(h.createdUrls[0].blob.type, 'audio/mpeg');
  assert.equal(h.createdUrls[0].blob.size, 4);
  assert.equal(h.player.src, 'blob:audio-1');
  assert.deepEqual(h.revokedUrls, []);
  h.player.ended = true;
  h.events.ended();
  assert.deepEqual(h.revokedUrls, ['blob:audio-1']);
  assert.equal(h.player.src, '');
});

test('a new sound cancels pending playback without revoking its replacement URL', async () => {
  const h = harness();
  let resolveOld;
  h.player.play = () => new Promise((resolve) => { resolveOld = resolve; });
  const first = h.send(custom);
  await tick();
  h.player.play = async () => {};
  const second = h.send(custom);
  assert.equal((await first).ok, false);
  assert.equal((await second).ok, true);
  assert.deepEqual(h.revokedUrls, ['blob:audio-1']);
  assert.equal(h.player.src, 'blob:audio-2');
  resolveOld();
  await tick();
  assert.deepEqual(h.revokedUrls, ['blob:audio-1']);
  // 이미 교체된 미디어가 남긴 이벤트는 새 소리를 해제하지 않는다.
  h.events.ended();
  h.events.error();
  assert.equal(h.player.src, 'blob:audio-2');
  h.windowEvents.pagehide();
  assert.deepEqual(h.revokedUrls, ['blob:audio-1', 'blob:audio-2']);
});

test('immediate repeated requests only start the newest sound', async () => {
  const h = harness();
  const first = h.send(custom);
  const second = h.send(bundled);
  assert.equal((await first).ok, false);
  assert.equal((await second).ok, true);
  assert.equal(h.player.plays, 1);
  assert.equal(h.player.src, h.runtime.getURL('sounds/chime.mp3'));
  assert.deepEqual(h.revokedUrls, ['blob:audio-1']);
});

test('invalid replacement leaves current audio untouched', async () => {
  const h = harness();
  await h.send(custom);
  assert.equal((await h.send({ ...bundled, filename: '../secret.mp3' })).ok, false);
  assert.equal(h.player.src, 'blob:audio-1');
  assert.equal(h.player.pauses, 0);
  assert.deepEqual(h.revokedUrls, []);
});

test('play rejection and synchronous failures return error acknowledgments and release resources', async () => {
  for (const synchronous of [false, true]) {
    const h = harness();
    h.player.play = () => {
      if (synchronous) throw new Error('Playback is blocked');
      return Promise.reject(new Error('Playback is blocked'));
    };
    const response = await h.send(custom);
    assert.equal(response.ok, false);
    assert.match(response.error, /Playback is blocked/);
    assert.deepEqual(h.revokedUrls, ['blob:audio-1']);
    assert.equal(h.timers.size, 0);
  }
});

test('hung playback times out and the next request can still play', async () => {
  const h = harness();
  h.player.play = () => new Promise(() => {});
  const request = h.send(custom);
  await tick();
  for (const callback of [...h.timers.values()]) callback();
  const response = await request;
  assert.equal(response.ok, false);
  assert.match(response.error, /timed out/);
  assert.deepEqual(h.revokedUrls, ['blob:audio-1']);
  h.player.play = async () => {};
  assert.equal((await h.send(bundled)).ok, true);
});

test('decoding errors reject pending startup and release custom audio', async () => {
  const h = harness();
  h.player.play = () => new Promise(() => {});
  const request = h.send(custom);
  await tick();
  h.player.error = { code: 4 };
  h.events.error();
  assert.equal((await request).ok, false);
  assert.deepEqual(h.revokedUrls, ['blob:audio-1']);
  assert.equal(h.timers.size, 0);
});
