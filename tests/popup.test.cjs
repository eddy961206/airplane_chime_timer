const assert = require('node:assert/strict');
const test = require('node:test');
const { fixture, flush } = require('./helpers/popup-fixture.cjs');

test('fresh setup initializes every field, leaves timer OFF, and allows upload button', async () => {
  const f = await fixture();
  assert.equal(f.ids.timerToggle.checked, false);
  assert.equal(f.ids.timerToggle.disabled, false);
  assert.equal(f.ids.customIntervalInput.value, 15);
  assert.equal(f.ids.repeatDaily.checked, false);
  assert.equal(f.ids.soundOptions.children.length, 5);
  assert.deepEqual(f.messages, [{ type: 'syncTimer' }]);
  assert.equal(f.writes.length, 0);
  await f.click('addCustomSound');
  assert.equal(f.ids.customSoundInput.clicked, true);
});

test('malicious stored filename is a literal text node, never markup', async () => {
  const name = '<img src=x onerror=alert(1)><button autofocus>Click me</button>';
  const f = await fixture({ selectedSound: 'custom_bad', customSounds: [{ value: 'custom_bad', name, data: 'data:audio/wav;base64,AAAA' }] });
  const label = f.ids.soundOptions.children.at(-1);
  assert.equal(label.children[1].tagName, 'SPAN');
  assert.equal(label.children[1].textContent, name);
  assert.equal(label.children.length, 3);
  assert.equal(f.ids.shortTimerSound.children.at(-1).textContent, name);
});

test('preset interval changes produce one mutation and no closing/unload mutation', async () => {
  const f = await fixture({ isActive: true });
  await f.change('intervalSelect', '30');
  assert.equal(f.state.interval, '30');
  assert.equal(f.messages.filter(x => x.action === 'updateAlarm').length, 1);
  assert.equal(f.events.beforeunload, undefined);
  assert.equal(f.events.unload, undefined);
});

test('invalid custom/specific time never overwrite the previous saved schedule or enable timer', async () => {
  const f = await fixture({ interval: '15', isActive: false });
  f.ids.customIntervalInput.value = '0';
  await f.change('intervalSelect', 'custom');
  assert.equal(f.state.interval, '15');
  assert.match(f.ids.settingsStatus.textContent, /whole number/);
  await f.change('timerToggle', true);
  assert.equal(f.ids.timerToggle.checked, false);
  assert.equal(f.state.isActive, false);
  await f.change('intervalSelect', 'specific');
  assert.equal(f.state.interval, '15');
  assert.match(f.ids.settingsStatus.textContent, /Choose a time/);
  await f.change('specificTimeInput', '09:30');
  assert.equal(f.state.interval, 'specific');
  assert.equal(f.state.repeatDaily, false);
  await f.change('timerToggle', true);
  assert.equal(f.state.isActive, true);
  assert.equal(f.messages.at(-1).type, 'toggleTimer');
});

test('custom interval and daily choice survive mode switches and reopening', async () => {
  const f = await fixture({ interval: 'custom', customInterval: 25, specificTime: '12:34', repeatDaily: true });
  assert.equal(f.ids.customIntervalInput.value, 25);
  assert.equal(f.ids.specificTimeInput.value, '12:34');
  assert.equal(f.ids.repeatDaily.checked, true);
  await f.change('intervalSelect', 'specific');
  await f.change('intervalSelect', 'custom');
  assert.equal(f.state.customInterval, 25);
  assert.equal(f.state.specificTime, '12:34');
  assert.equal(f.state.repeatDaily, true);
});

test('dual validation preserves previous settings and sound-only change does not reschedule', async () => {
  const f = await fixture({ isActive: true });
  await f.mode('dual');
  assert.equal(f.state.timerMode, 'dual');
  assert.equal(f.ids.dualTimerSection.hidden, false);
  assert.equal(f.ids.singleTimerSection.hidden, true);
  await f.change('shortIntervalSelect', '20');
  const before = structuredClone(f.state.dualTimer);
  await f.change('longIntervalSelect', '45');
  assert.deepEqual(f.state.dualTimer, before);
  assert.match(f.ids.dualTimerValidation.textContent, /exact multiple/);
  const messages = f.messages.length;
  await f.change('shortTimerSound', 'chime3');
  assert.equal(f.state.dualTimer.shortSound, 'chime3');
  assert.equal(f.messages.length, messages);
  assert.equal(f.previews.at(-1).sound, 'chime3');
});

test('OFF always works even while the visible timing form is invalid', async () => {
  const f = await fixture({ isActive: true });
  await f.change('intervalSelect', 'specific');
  await f.change('timerToggle', false);
  assert.equal(f.state.isActive, false);
  assert.equal(f.messages.at(-1).isActive, false);
});

test('deleting a custom sound repairs single and both dual references without rescheduling', async () => {
  const custom = { value: 'custom_1', name: 'My sound', data: 'data:audio/wav;base64,AAAA' };
  const f = await fixture({ selectedSound: custom.value, customSounds: [custom], dualTimer: { shortInterval: 15, longInterval: 60, shortSound: custom.value, longSound: custom.value } });
  f.ids.soundOptions.children.at(-1).children.at(-1).click(); await flush();
  assert.equal(f.state.selectedSound, 'chime1');
  assert.equal(f.state.dualTimer.shortSound, 'chime1');
  assert.equal(f.state.dualTimer.longSound, 'chime2');
  assert.equal(f.state.customSounds.length, 0);
  assert.equal(f.messages.length, 1);
});

test('upload is local, uses unique IDs, handles empty MIME, and permits selecting the same file again', async () => {
  const f = await fixture();
  const file = new File([Buffer.from([82,73,70,70])], '<img src=x onerror=alert(1)>.wav', { type: '' });
  await f.upload(file);
  assert.equal(f.state.customSounds.length, 1);
  assert.match(f.state.customSounds[0].data, /^data:audio\/wav;base64,/);
  assert.equal(f.ids.customSoundInput.value, '');
  await f.upload(file);
  assert.equal(f.state.customSounds.length, 2);
  assert.notEqual(f.state.customSounds[0].value, f.state.customSounds[1].value);
  assert.equal(f.previews.length, 2);
});

test('non-audio and oversized uploads are rejected without mutation', async () => {
  const f = await fixture();
  await f.upload(new File(['<html>'], 'bad.html', { type: 'text/html' }));
  assert.equal(f.state.customSounds, undefined);
  assert.match(f.ids.settingsStatus.textContent, /supported audio/);
  await f.upload(new File([new Uint8Array(1048577)], 'large.wav', { type: 'audio/wav' }));
  assert.match(f.ids.settingsStatus.textContent, /up to 1 MB/);
  assert.equal(f.state.customSounds, undefined);
});

test('initial worker failure is visible and prevents falsely enabling the timer', async () => {
  const f = await fixture({}, { failMessage: true });
  assert.match(f.ids.settingsStatus.textContent, /Setup could not finish: Schedule failed/);
});

test('review prompt stays local and retains timing, cooldown, and dismiss controls', async () => {
  const f = await fixture({ installedAt: Date.now() - 4 * 86400000, chimeCount: 10 });
  assert.equal(f.ids.reviewPrompt.style.display, 'block');
  assert.equal(f.state.reviewPrompt.promptCount, 1);
  await f.click('rateNeverBtn');
  assert.equal(f.state.reviewPrompt.dontAskAgain, true);
  assert.equal(f.ids.reviewPrompt.style.display, 'none');
});

test('switching modes preserves the last valid hidden settings and discards rejected drafts', async () => {
  const f = await fixture({ interval: 'custom', customInterval: 25, specificTime: '09:30', repeatDaily: true,
    dualTimer: { shortInterval: 20, longInterval: 60, shortSound: 'chime1', longSound: 'chime2' } });
  await f.change('customIntervalInput', '0');
  assert.equal(f.state.customInterval, 25);
  await f.mode('dual');
  assert.equal(f.state.customInterval, 25);
  assert.equal(Number(f.ids.customIntervalInput.value), 25);
  assert.equal(f.state.specificTime, '09:30');
  assert.equal(f.state.repeatDaily, true);
  assert.deepEqual(Object.keys(f.writes.at(-1)).sort(), ['dualTimer', 'timerMode']);

  await f.change('longIntervalSelect', '45');
  assert.equal(f.state.dualTimer.longInterval, 60);
  await f.mode('single');
  assert.equal(f.state.dualTimer.longInterval, 60);
  assert.equal(Number(f.ids.longIntervalSelect.value), 60);
  assert.equal(f.state.customInterval, 25);
  assert.equal(f.ids.settingsStatus.textContent, '');
  assert.deepEqual(Object.keys(f.writes.at(-1)).sort(), ['customInterval', 'interval', 'timerMode']);
  await f.mode('dual');
  assert.equal(f.state.timerMode, 'dual');
  assert.equal(f.ids.settingsStatus.textContent, '');
});

test('switching interval types does not save rejected custom/time drafts', async () => {
  const f = await fixture({ interval: 'custom', customInterval: 25, specificTime: '09:30', repeatDaily: true });
  await f.change('customIntervalInput', '0');
  await f.change('intervalSelect', '30');
  assert.equal(f.state.customInterval, 25);
  assert.equal(Number(f.ids.customIntervalInput.value), 25);
  await f.change('intervalSelect', 'specific');
  await f.change('specificTimeInput', '');
  await f.change('intervalSelect', 'custom');
  assert.equal(f.state.specificTime, '09:30');
  assert.equal(f.ids.specificTimeInput.value, '09:30');
  assert.equal(f.state.repeatDaily, true);
  assert.equal(f.state.customInterval, 25);
  assert.equal(f.ids.settingsStatus.textContent, '');
});

test('turning ON saves only the active settings even with invalid hidden inputs', async () => {
  const single = await fixture({ interval: '15', customInterval: 25, specificTime: '09:30', repeatDaily: true,
    dualTimer: { shortInterval: 20, longInterval: 60, shortSound: 'chime1', longSound: 'chime2' } });
  single.ids.customIntervalInput.value = '0';
  single.ids.specificTimeInput.value = '';
  single.ids.repeatDaily.checked = false;
  single.ids.longIntervalSelect.value = '45';
  await single.change('timerToggle', true);
  assert.equal(single.state.isActive, true);
  assert.equal(single.state.customInterval, 25);
  assert.equal(single.state.specificTime, '09:30');
  assert.equal(single.state.repeatDaily, true);
  assert.equal(single.state.dualTimer.longInterval, 60);
  assert.deepEqual(Object.keys(single.writes.at(-1)).sort(), ['interval', 'isActive', 'timerMode']);

  const dual = await fixture({ timerMode: 'dual', interval: 'custom', customInterval: 25 });
  dual.ids.customIntervalInput.value = '0';
  await dual.change('timerToggle', true);
  assert.equal(dual.state.isActive, true);
  assert.equal(dual.state.customInterval, 25);
  assert.equal(Number(dual.ids.customIntervalInput.value), 25);
  assert.deepEqual(Object.keys(dual.writes.at(-1)).sort(), ['dualTimer', 'isActive', 'timerMode']);
});

test('a settings storage failure does not notify the worker or overwrite the saved timing', async () => {
  const f = await fixture({ interval: 'custom', customInterval: 25 });
  const previousMessages = f.messages.length;
  f.chrome.storage.local.set = async () => { throw new Error('Storage quota exceeded'); };
  await f.change('customIntervalInput', '30');
  assert.equal(f.state.customInterval, 25);
  assert.equal(f.messages.length, previousMessages);
  assert.match(f.ids.settingsStatus.textContent, /Storage quota exceeded/);
  await f.change('timerToggle', true);
  assert.equal(f.state.isActive, undefined);
  assert.equal(f.ids.timerToggle.checked, false);
  assert.equal(f.messages.length, previousMessages);
});
