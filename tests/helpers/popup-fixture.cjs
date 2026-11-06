const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');
const root = path.resolve(__dirname, '..', '..');
const script = fs.readFileSync(path.join(root, 'popup.js'), 'utf8');
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };

async function fixture(initial = {}, { failMessage = false, configureChrome = () => {} } = {}) {
  const events = {}, messages = [], writes = [], previews = [], errors = [];
  const state = structuredClone(initial);
  const storageListeners = [];
  function element(tag = 'div', id = '') {
    const classes = new Set();
    return {
      tagName: tag.toUpperCase(), id, value: '', checked: false, hidden: false, disabled: false,
      textContent: '', children: [], style: {}, listeners: {}, attrs: {}, files: [],
      classList: { toggle(name, force) { if (force) classes.add(name); else classes.delete(name); } },
      append(...items) { for (const item of items) { item.parent = this; this.children.push(item); } },
      replaceChildren(...items) { this.children = []; this.append(...items); },
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
      setAttribute(name, value) { this.attrs[name] = value; },
      click() { this.clicked = true; for (const fn of this.listeners.click || []) fn({ target: this, preventDefault() {} }); },
      set innerHTML(_) { throw new Error('HTML injection sink used'); }
    };
  }
  const html = fs.readFileSync(path.join(root, 'popup.html'), 'utf8');
  const ids = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(m => [m[1], element('div', m[1])]));
  const modes = ['single', 'dual'].map(value => ({ ...element('input'), value, checked: value === 'single' }));
  const dualStatus = element();
  const document = {
    getElementById(id) { return ids[id]; }, createElement: element,
    addEventListener(type, fn) { (events[type] ||= []).push(fn); },
    dispatchEvent(event) { if (event.type === 'chime:preview') previews.push(event.detail); for (const fn of events[event.type] || []) fn(event); },
    querySelector(selector) {
      if (selector === '.dual-timer-status') return dualStatus;
      if (selector.endsWith(':checked')) return modes.find(x => x.checked);
      const value = selector.match(/\[value="([^"]+)"\]/)?.[1];
      return modes.find(x => x.value === value);
    },
    querySelectorAll() { return modes; }
  };
  class FileReader {
    async readAsDataURL(blob) {
      this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`;
      this.onload();
    }
  }
  const chrome = {
    runtime: { id: 'test', getURL: value => 'chrome-extension://test/' + value,
      async sendMessage(message) { messages.push(structuredClone(message)); return failMessage ? { ok: false, error: 'Schedule failed' } : { ok: true }; }
    },
    storage: { local: {
      async get(keys) {
        if (typeof keys === 'string') return { [keys]: structuredClone(state[keys]) };
        return { ...structuredClone(keys), ...structuredClone(state) };
      },
      async set(values) {
        writes.push(structuredClone(values));
        const changes = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { newValue: value, oldValue: state[key] }]));
        Object.assign(state, structuredClone(values));
        storageListeners.forEach(fn => fn(changes, 'local'));
      }
    }, onChanged: { addListener(fn) { storageListeners.push(fn); } } }
  };
  // 통합 검사에서는 실행 전에 실제 워커 메시지 경로와 저장소를 연결한다.
  configureChrome(chrome, { messages });
  vm.runInNewContext(script, { document, chrome, console: { warn: (...args) => errors.push(args) }, Blob, FileReader, crypto: webcrypto,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    fetch: async () => ({ json: async () => JSON.parse(fs.readFileSync(path.join(root, 'sounds/sounds.json'), 'utf8')) })
  });
  document.dispatchEvent({ type: 'DOMContentLoaded' }); await flush();
  async function change(id, value) {
    const item = ids[id];
    if (typeof value === 'boolean') item.checked = value; else if (value !== undefined) item.value = String(value);
    for (const fn of item.listeners.change || []) fn({ target: item });
    await flush();
  }
  return { ids, modes, state, writes, messages, errors, previews, events, chrome, document,
    change, async click(id) { ids[id].click(); await flush(); },
    async mode(value) {
      modes.forEach(x => x.checked = x.value === value);
      for (const fn of modes.find(x => x.value === value).listeners.change) fn();
      await flush();
    },
    async upload(file) { ids.customSoundInput.files = [file]; await change('customSoundInput'); }
  };
}

module.exports = { fixture, flush };
