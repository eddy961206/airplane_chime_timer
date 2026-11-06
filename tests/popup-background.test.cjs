const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./helpers/popup-fixture.cjs');
const { harness } = require('./helpers/background-harness.cjs');

// DOM/Chrome API는 모의 환경이지만 팝업과 워커의 실제 코드를 연결해 메시지 계약을 검증한다.
// 브라우저의 실제 음성 디코딩과 오프스크린 문서 수명은 별도 browser-smoke에서 검증한다.
function connectBackground(background) {
  return (chrome, { messages }) => {
    background.chrome.runtime.id = chrome.runtime.id;
    background.chrome.runtime.getURL = chrome.runtime.getURL;
    background.chrome.storage = chrome.storage;
    chrome.runtime.sendMessage = (message) => {
      messages.push(structuredClone(message));
      return background.dispatch(message, {
        id: chrome.runtime.id,
        url: chrome.runtime.getURL('popup.html')
      });
    };
  };
}

test('popup and background agree on ON/OFF, mode changes, sound-only edits and specific-time validation', async () => {
  const background = harness();
  const popup = await fixture({}, { configureChrome: connectBackground(background) });
  assert.deepEqual(popup.messages, [{ type: 'syncTimer' }]);
  assert.equal(background.alarms.size, 0);
  assert.equal(popup.ids.settingsStatus.textContent, '');

  await popup.change('timerToggle', true);
  assert.equal(background.alarms.get('chimeAlarm').periodInMinutes, 15);
  assert.equal(background.badges.at(-1), 'ON');

  await popup.change('intervalSelect', '30');
  assert.equal(background.alarms.get('chimeAlarm').periodInMinutes, 30);

  await popup.mode('dual');
  assert.deepEqual([...background.alarms.keys()], ['shortTimer', 'longTimer']);
  assert.equal(background.alarms.get('shortTimer').periodInMinutes, 15);
  assert.equal(background.alarms.get('longTimer').periodInMinutes, 60);
  const shortDue = background.alarms.get('shortTimer').scheduledTime;
  const createdCount = background.created.length;
  await popup.change('shortTimerSound', 'chime4');
  assert.equal(background.alarms.get('shortTimer').scheduledTime, shortDue);
  assert.equal(background.created.length, createdCount);

  await popup.mode('single');
  assert.deepEqual([...background.alarms.keys()], ['chimeAlarm']);
  assert.equal(background.alarms.get('chimeAlarm').periodInMinutes, 30);
  await popup.change('intervalSelect', 'specific');
  assert.match(popup.ids.settingsStatus.textContent, /Choose a time/);
  assert.equal(background.alarms.get('chimeAlarm').periodInMinutes, 30);

  await popup.change('specificTimeInput', '12:34');
  const alarm = background.alarms.get('chimeAlarm');
  assert.equal(new Date(alarm.scheduledTime).getHours(), 12);
  assert.equal(new Date(alarm.scheduledTime).getMinutes(), 34);
  assert.equal(alarm.periodInMinutes, undefined);
  assert.equal(popup.ids.settingsStatus.textContent, '');

  await popup.change('timerToggle', false);
  assert.equal(background.alarms.size, 0);
  assert.equal(background.badges.at(-1), 'OFF');
  assert.equal(popup.state.isActive, false);
});

test('opening the popup repairs a missing saved schedule and reopening preserves its phase', async () => {
  const background = harness();
  const popup = await fixture({ isActive: true, interval: 'custom', customInterval: 90 }, {
    configureChrome: connectBackground(background)
  });
  const alarm = background.alarms.get('chimeAlarm');
  assert.equal(alarm.periodInMinutes, 90);
  assert.equal(popup.ids.settingsStatus.textContent, '');
  background.setTime('2026-10-02T10:16:00');
  const reopened = await fixture(popup.state, { configureChrome: connectBackground(background) });
  assert.equal(background.alarms.get('chimeAlarm').scheduledTime, alarm.scheduledTime);
  assert.equal(background.created.length, 1);
  assert.equal(reopened.ids.timerToggle.checked, true);
  assert.equal(reopened.ids.settingsStatus.textContent, '');
});

test('a real worker scheduling error reaches the popup instead of a false success', async () => {
  const background = harness();
  const popup = await fixture({}, { configureChrome: connectBackground(background) });
  background.chrome.alarms.create = async () => { throw new Error('Scheduling unavailable'); };
  await popup.change('timerToggle', true);
  assert.match(popup.ids.settingsStatus.textContent, /Scheduling unavailable/);
  assert.equal(background.alarms.size, 0);
  assert.equal(background.badges.at(-1), 'OFF');

  // 저장된 ON 의도가 있어도 사용자는 오류 상태에서 즉시 OFF로 전환할 수 있다.
  await popup.change('timerToggle', false);
  assert.equal(popup.state.isActive, false);
  assert.equal(popup.ids.timerToggle.checked, false);
  assert.equal(popup.ids.settingsStatus.textContent, '');
});
