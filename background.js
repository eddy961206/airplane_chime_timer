const DEFAULT_SETTINGS = {
  isActive: false,
  selectedSound: 'chime1',
  interval: '15',
  customInterval: 15,
  specificTime: '',
  repeatDaily: false,
  timerMode: 'single',
  dualTimer: {
    shortInterval: 15,
    longInterval: 60,
    shortSound: 'chime1',
    longSound: 'chime2'
  },
  dualSchedule: null,
  volume: 50
};

const MIN_INTERVAL_MINUTES = 1;
const MAX_INTERVAL_MINUTES = 1440;
let offscreenCreation = null;
let timerOperations = Promise.resolve();

chrome.runtime.onInstalled.addListener((details) => {
  void handleInstalled(details).catch(reportError);
});

chrome.runtime.onStartup.addListener(() => {
  void handleStartup().catch(reportError);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 오프스크린 재생 메시지와 다른 알림에는 응답하지 않아 올바른 수신자의 응답을 보존한다.
  if (!isTimerMessage(message)) return false;
  if (!isTrustedTimerSender(sender)) {
    sendResponse({ ok: false, error: 'Untrusted timer message sender.' });
    return false;
  }
  handleMessage(message).then(
    () => sendResponse({ ok: true }),
    (error) => {
      reportError(error);
      sendResponse({ ok: false, error: error.message || 'Unable to update the timer.' });
    }
  );
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  void handleAlarm(alarm).catch(reportError);
});

function reportError(error) {
  console.error('Timer operation failed:', error);
}

// 설정 변경과 알람 처리를 순서대로 마쳐, 늦게 끝난 ON 작업이 OFF 결과를 덮지 않게 한다.
function queueTimerOperation(operation) {
  const result = timerOperations.then(operation);
  timerOperations = result.catch(() => {});
  return result;
}

async function handleInstalled(details) {
  return queueTimerOperation(() => installTimer(details));
}

async function installTimer(details) {
  await ensureInstalledAt();
  clearUninstallRedirect();
  await restoreActiveTimer();

  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'welcome.html' });
  }
}

async function handleStartup() {
  return queueTimerOperation(async () => {
    clearUninstallRedirect();
    await restoreActiveTimer();
  });
}

function isTimerMessage(message) {
  return message !== null && typeof message === 'object' && !Array.isArray(message)
    && (message.action === 'updateAlarm'
      || ['toggleTimer', 'updateDualTimer', 'syncTimer'].includes(message.type));
}

function isTrustedTimerSender(sender) {
  return sender?.id === chrome.runtime.id
    && ['popup.html', 'welcome.html'].some((page) => sender.url === chrome.runtime.getURL(page));
}

function validateTimerMessage(message) {
  if (!isTimerMessage(message)) throw new Error('Invalid timer message.');
  if (message.type === 'toggleTimer' && typeof message.isActive !== 'boolean') {
    throw new Error('Timer activation must be a boolean.');
  }
  if (message.action === 'updateAlarm') {
    validateSingleSettings(message);
  } else if (message.type === 'updateDualTimer') {
    validateDualTimer(message.dualTimer);
  }
}

async function handleMessage(message) {
  validateTimerMessage(message);
  return queueTimerOperation(() => applyMessage(message));
}

async function applyMessage(message) {
  // UI가 저장한 최신 설정을 읽는다. 오래 대기한 메시지의 값으로 새 설정을 덮지 않는다.
  const settings = await loadSettings();
  if (message.action === 'updateAlarm') {
    if (!settings.isActive || settings.timerMode === 'dual') return;
    await createSingleAlarm(settings);
    await setBadge(true);
    return;
  }

  if (message.type === 'toggleTimer' || message.type === 'syncTimer') {
    await restoreActiveTimer(message.type === 'toggleTimer');
    return;
  }

  if (message.type === 'updateDualTimer' && settings.isActive && settings.timerMode === 'dual') {
    validateDualTimer(settings.dualTimer);
    // 소리만 바뀌었을 때는 이미 실행 중인 두 주기의 기준 시각을 유지한다.
    if (!await hasMatchingDualAlarms(settings.dualTimer)) await createDualTimerAlarm(settings.dualTimer);
    await setBadge(true);
  }
}

async function handleAlarm(alarm) {
  return queueTimerOperation(() => playAlarm(alarm));
}

async function playAlarm(alarm) {
  const settings = await loadSettings();
  if (!settings.isActive) {
    return;
  }

  const sound = await pickSoundForAlarm(alarm, settings);
  if (!sound) {
    return;
  }

  // 일회성 알람은 완료를 저장해야 브라우저 재시작 때 다음 날로 다시 예약되지 않는다.
  if (alarm.name === 'chimeAlarm' && settings.interval === 'specific') {
    if (settings.repeatDaily) {
      // 1440분 반복은 절전과 서머타임에 밀릴 수 있으므로 다음 현지 시각을 새로 예약한다.
      await createSingleAlarm(settings);
    } else {
      await chrome.storage.local.set({ isActive: false });
      await clearAlarms();
      await setBadge(false);
    }
  }

  if (await playSound(sound, settings.volume)) {
    await incrementChimeCount();
  }

  if (alarm.name === 'chimeAlarm') {
    await notifyNextChimeTime('chimeAlarm');
  }
}

async function pickSoundForAlarm(alarm, settings) {
  const alarmName = alarm.name;
  if (alarmName === 'chimeAlarm') {
    if (settings.timerMode === 'dual') return null;
    return settings.selectedSound || DEFAULT_SETTINGS.selectedSound;
  }

  if (settings.timerMode !== 'dual' || !settings.dualTimer) {
    return null;
  }

  if (alarmName === 'longTimer') {
    const longAlarm = await chrome.alarms.get('longTimer');
    // 절전 해제 후에는 Chrome이 다음 반복 시각을 이동시킬 수 있으므로 전후 예약을 함께 보존한다.
    await chrome.storage.local.set({ dualSchedule: {
      lastLongTime: alarm.scheduledTime,
      nextLongTime: longAlarm?.scheduledTime
    } });
    return settings.dualTimer.longSound;
  }

  if (alarmName === 'shortTimer') {
    const longAlarm = await chrome.alarms.get('longTimer');
    const schedule = settings.dualSchedule;
    // 절전 중 놓친 짧은 알람보다 긴 알람도 이미 도래했다면 긴 소리 한 번으로 합친다.
    if (schedule && Number.isFinite(alarm.scheduledTime)
      && ((Number.isFinite(schedule.lastLongTime) && alarm.scheduledTime <= schedule.lastLongTime)
        || (Number.isFinite(schedule.nextLongTime) && schedule.nextLongTime <= Date.now()
          && alarm.scheduledTime <= schedule.nextLongTime))) return null;
    if (schedule && [schedule.lastLongTime, schedule.nextLongTime].some(
      (time) => Number.isFinite(time) && Math.abs(time - alarm.scheduledTime) < 1000
    )) return null;
    if (longAlarm && Number.isFinite(alarm.scheduledTime)) {
      // 현재 분 대신 실제 예약 시각으로 비교한다. 긴 알람은 이미 다음 주기로 갱신될 수 있다.
      const period = clampInterval(settings.dualTimer.longInterval, 60) * 60000;
      const difference = alarm.scheduledTime - longAlarm.scheduledTime;
      const distance = Math.abs(difference - Math.round(difference / period) * period);
      if (distance < 1000) return null;
    }
    return settings.dualTimer.shortSound;
  }

  return null;
}

async function hasMatchingDualAlarms(dualTimer) {
  const shortAlarm = await chrome.alarms.get('shortTimer');
  const longAlarm = await chrome.alarms.get('longTimer');
  return shortAlarm?.periodInMinutes === Number(dualTimer.shortInterval)
    && longAlarm?.periodInMinutes === Number(dualTimer.longInterval);
}

async function restoreActiveTimer(reset = false) {
  const settings = await loadSettings();
  if (!settings.isActive) {
    await clearAlarms();
    await setBadge(false);
    return;
  }

  if (settings.timerMode === 'dual') {
    validateDualTimer(settings.dualTimer);
    if (reset || !settings.dualSchedule || !await hasMatchingDualAlarms(settings.dualTimer)) {
      await createDualTimerAlarm(settings.dualTimer);
    }
  } else {
    validateSingleSettings(settings);
    const alarm = await chrome.alarms.get('chimeAlarm');
    let matches = false;
    if (!reset && alarm) {
      if (settings.interval === 'specific') {
        // 지연된 일회성 알람은 Chrome 이벤트에 맡기고 미래의 일일 예약만 현지 시각과 비교한다.
        matches = !alarm.periodInMinutes && (alarm.scheduledTime <= Date.now()
          || alarm.scheduledTime === getNextSpecificTime(settings.specificTime).getTime());
      } else {
        matches = alarm.periodInMinutes === getSingleInterval(settings);
      }
    }
    if (!matches) await createSingleAlarm(settings);
  }
  await setBadge(true);
}

function isValidInterval(value) {
  return (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value)))
    && Number.isInteger(Number(value)) && Number(value) >= MIN_INTERVAL_MINUTES
    && Number(value) <= MAX_INTERVAL_MINUTES;
}

function getSingleInterval(settings) {
  return Number(settings.interval === 'custom' ? settings.customInterval : settings.interval);
}

function validateSingleSettings(settings) {
  if (settings.interval === 'specific') {
    if (typeof settings.specificTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.specificTime)) {
      throw new Error('Choose a valid alarm time (HH:MM).');
    }
    if (settings.repeatDaily !== undefined && typeof settings.repeatDaily !== 'boolean') {
      throw new Error('Daily repeat must be a boolean.');
    }
  } else if (!isValidInterval(settings.interval === 'custom' ? settings.customInterval : settings.interval)) {
    throw new Error('The timer interval must be a whole number from 1 to 1440 minutes.');
  }
}

function validateDualTimer(dualTimer) {
  if (!dualTimer || typeof dualTimer !== 'object' || Array.isArray(dualTimer)
    || !isValidInterval(dualTimer.shortInterval) || !isValidInterval(dualTimer.longInterval)) {
    throw new Error('Both timer intervals must be whole numbers from 1 to 1440 minutes.');
  }
  const shortInterval = Number(dualTimer.shortInterval);
  const longInterval = Number(dualTimer.longInterval);
  if (shortInterval >= longInterval || longInterval % shortInterval !== 0) {
    throw new Error('Timer 2 must be a larger multiple of Timer 1.');
  }
  if (![dualTimer.shortSound, dualTimer.longSound].every((sound) => typeof sound === 'string' && sound.length > 0 && sound.length <= 200)) {
    throw new Error('Choose a sound for both timers.');
  }
}

async function replaceAlarmSchedule(createSchedule) {
  // 일시적인 Chrome API 오류는 한 번 재시도한다. 실패한 듀얼 예약을 반쪽 상태로 남기지 않는다.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await clearAlarms();
      await createSchedule();
      return;
    } catch (error) {
      if (attempt === 1) {
        await clearAlarms().catch(reportError);
        await setBadge(false).catch(reportError);
        throw error;
      }
    }
  }
}

async function createSingleAlarm(settings) {
  // 유효하지 않은 편집 때문에 기존 예약이 사라지지 않도록 삭제 전에 검증한다.
  validateSingleSettings(settings);
  await replaceAlarmSchedule(async () => {
    if (settings.interval === 'specific') {
      await chrome.alarms.create('chimeAlarm', { when: getNextSpecificTime(settings.specificTime).getTime() });
    } else {
      const now = new Date();
      const interval = getSingleInterval(settings);
      await chrome.alarms.create('chimeAlarm', {
        when: now.getTime() + getDelayToNextInterval(now, interval) * 60000,
        periodInMinutes: interval
      });
    }
  });
  await notifyNextChimeTime('chimeAlarm');
}

async function createDualTimerAlarm(dualTimer) {
  validateDualTimer(dualTimer);
  await replaceAlarmSchedule(async () => {
    const now = new Date();
    const shortInterval = Number(dualTimer.shortInterval);
    const longInterval = Number(dualTimer.longInterval);
    const nextLongTime = now.getTime() + getDelayToNextInterval(now, longInterval) * 60000;
    await chrome.alarms.create('shortTimer', {
      when: now.getTime() + getDelayToNextInterval(now, shortInterval) * 60000,
      periodInMinutes: shortInterval
    });
    await chrome.alarms.create('longTimer', { when: nextLongTime, periodInMinutes: longInterval });
    await chrome.storage.local.set({ dualSchedule: { nextLongTime, lastLongTime: null } });
  });
}

async function clearAlarms() {
  await chrome.alarms.clearAll();
}

function getDelayToNextInterval(now, interval) {
  const minutes = now.getMinutes();
  const seconds = now.getSeconds() + now.getMilliseconds() / 1000;
  let delay = Math.ceil(minutes / interval) * interval - minutes - seconds / 60;
  if (delay <= 0) {
    delay += interval;
  }
  return delay;
}

function getNextSpecificTime(value) {
  validateSingleSettings({ interval: 'specific', specificTime: value });
  const [hours, minutes] = value.split(':').map(Number);
  const next = new Date();
  next.setHours(hours, minutes, 0, 0);
  if (next <= new Date()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function clampInterval(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return Number.parseInt(fallback, 10);
  }
  return Math.max(MIN_INTERVAL_MINUTES, Math.min(MAX_INTERVAL_MINUTES, parsed));
}

async function playSound(soundName, volume) {
  if (typeof soundName !== 'string' || soundName.length > 200) return false;
  const isCustomSound = soundName.startsWith('custom_');
  let filename = '';
  let soundUrl = '';

  if (isCustomSound) {
    const { customSounds = [] } = await chrome.storage.local.get('customSounds');
    const customSound = Array.isArray(customSounds) && customSounds.find((sound) => sound?.value === soundName);
    if (!customSound || typeof customSound.filename !== 'string' || typeof customSound.data !== 'string'
      || customSound.data.length > 1400000) return false;
    filename = customSound.filename;
    soundUrl = customSound.data;
  } else {
    const soundInfo = await getSoundInfoFromJson(soundName);
    if (!soundInfo) return false;
    filename = soundInfo.filename;
  }

  const message = { type: 'playSound', soundUrl, filename, volume: clampVolume(volume), isCustomSound };
  // 문서 생성 직후 수신기가 아직 준비되지 않은 경우만 재전송하여 중복 재생을 피한다.
  for (let attempt = 0; attempt < 3; attempt++) {
    await ensureOffscreenDocument();
    try {
      const response = await chrome.runtime.sendMessage(message);
      if (response?.ok !== true) {
        console.error('Audio playback was not confirmed:', response?.error || 'No acknowledgment.');
        return false;
      }
      return true;
    } catch (error) {
      if (attempt === 2 || !/Receiving end does not exist|Could not establish connection/i.test(error.message || '')) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
  return false;
}

async function getSoundInfoFromJson(soundName) {
  try {
    const response = await fetch(chrome.runtime.getURL('sounds/sounds.json'));
    const data = await response.json();
    return Array.isArray(data.sounds) ? data.sounds.find((sound) => sound?.value === soundName) : null;
  } catch (error) {
    console.error('Failed to load sounds.json:', error);
    return null;
  }
}

function clampVolume(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SETTINGS.volume;
  }
  return Math.max(0, Math.min(100, parsed));
}

async function ensureOffscreenDocument() {
  // 동시에 도착한 알람은 동일한 생성 작업을 기다려 오프스크린 문서 생성 경합을 피한다.
  if (!offscreenCreation) {
    offscreenCreation = (async () => {
      if (await chrome.offscreen.hasDocument()) return;
      await chrome.offscreen.createDocument({
        url: 'audio-player.html',
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Playing alarm sound'
      });
    })();
  }
  try {
    await offscreenCreation;
  } finally {
    offscreenCreation = null;
  }
}

async function loadSettings() {
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  // 저장소가 손상되어도 문자열 'false' 등을 켜진 상태로 해석하지 않는다.
  settings.isActive = settings.isActive === true;
  settings.repeatDaily = settings.repeatDaily === true;
  return settings;
}

async function ensureInstalledAt() {
  const { installedAt } = await chrome.storage.local.get('installedAt');
  if (!installedAt) {
    await chrome.storage.local.set({ installedAt: Date.now() });
  }
}

async function incrementChimeCount() {
  const { chimeCount = 0 } = await chrome.storage.local.get('chimeCount');
  await chrome.storage.local.set({
    chimeCount: (Number.isSafeInteger(chimeCount) && chimeCount >= 0 ? chimeCount : 0) + 1,
    lastChimeAt: Date.now()
  });
}

async function setBadge(isActive) {
  await chrome.action.setBadgeText({ text: isActive ? 'ON' : 'OFF' });
  await chrome.action.setBadgeBackgroundColor({ color: isActive ? '#4CAF50' : '#9e9e9e' });
}

async function notifyNextChimeTime(alarmName, nextTime) {
  const alarm = nextTime ? null : await chrome.alarms.get(alarmName);
  const scheduledTime = nextTime || (alarm ? new Date(alarm.scheduledTime) : null);
  if (!scheduledTime) {
    return;
  }

  chrome.runtime.sendMessage({
    type: 'updateNextChimeTime',
    nextChimeTime: scheduledTime
  }).catch(() => {});
}

function clearUninstallRedirect() {
  chrome.runtime.setUninstallURL('');
}
