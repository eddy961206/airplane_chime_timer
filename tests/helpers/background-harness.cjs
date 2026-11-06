const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'background.js'), 'utf8');

function harness(initial = {}, initialTime = '2026-10-02T10:10:00') {
  let now = new Date(initialTime).getTime();
  const data = { ...initial };
  const alarms = new Map();
  const messages = [];
  const badges = [];
  const created = [];
  let offscreenExists = false;
  let offscreenCreations = 0;
  const event = () => ({ listeners: [], addListener(listener) { this.listeners.push(listener); } });
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const chrome = {
    runtime: {
      id: 'test-extension',
      onInstalled: event(), onStartup: event(), onMessage: event(),
      getURL: (value) => `chrome-extension://test-extension/${value}`,
      sendMessage: async (message) => { messages.push(message); return { ok: true }; },
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
    chrome, Date: Clock, console, setTimeout,
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
    offscreenCreations: () => offscreenCreations,
    dispatch(message, sender = { id: chrome.runtime.id, url: chrome.runtime.getURL('popup.html') }) {
      return new Promise((resolve) => {
        const keptOpen = chrome.runtime.onMessage.listeners[0](message, sender, resolve);
        if (!keptOpen) resolve(undefined);
      });
    }
  };
}

module.exports = { harness };
