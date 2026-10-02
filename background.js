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

chrome.runtime.onMessage.addListener((message) => {
  void handleMessage(message).catch(reportError);
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

async function handleMessage(message) {
  return queueTimerOperation(() => applyMessage(message));
}

async function applyMessage(message) {
  if (message.action === 'updateAlarm') {
    const settings = await loadSettings();
    // 꺼진 타이머의 편집이나 숨겨진 단일 모드 UI가 실행 중인 알람을 바꾸지 않게 한다.
    if (!settings.isActive || settings.timerMode === 'dual') {
      return;
    }
    await createSingleAlarm({
      interval: message.interval,
      customInterval: message.customInterval,
      specificTime: message.specificTime,
      repeatDaily: message.repeatDaily
    });
    return;
  }

  if (message.type === 'toggleTimer') {
    if (message.isActive) {
      await restoreActiveTimer(true);
    } else {
      await clearAlarms();
    }
    const settings = await loadSettings();
    await setBadge(settings.isActive);
    return;
  }

  if (message.type === 'updateDualTimer') {
    const settings = await loadSettings();
    if (settings.isActive && settings.timerMode === 'dual') {
      await createDualTimerAlarm(message.dualTimer);
    }
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

async function restoreActiveTimer(reset = false) {
  const settings = await loadSettings();
  await setBadge(settings.isActive);

  if (!settings.isActive) {
    await clearAlarms();
    return;
  }

  if (settings.timerMode === 'dual' && settings.dualTimer) {
    if (!reset && settings.dualSchedule && await chrome.alarms.get('shortTimer') && await chrome.alarms.get('longTimer')) return;
    await createDualTimerAlarm(settings.dualTimer);
  } else {
    const alarm = await chrome.alarms.get('chimeAlarm');
    if (!reset && alarm) {
      const isDaily = settings.interval === 'specific' && settings.repeatDaily;
      // 지나간 알람은 Chrome의 지연 이벤트에 맡기고, 미래의 매일 예약만 현지 시각과 대조한다.
      if (!isDaily || alarm.scheduledTime <= Date.now()
        || (!alarm.periodInMinutes && alarm.scheduledTime === getNextSpecificTime(settings.specificTime).getTime())) return;
    }
    await createSingleAlarm(settings);
  }
}

async function createSingleAlarm(settings) {
  await clearAlarms();

  const now = new Date();
  let nextTime;

  if (settings.interval === 'specific' && settings.specificTime) {
    nextTime = getNextSpecificTime(settings.specificTime);
    await chrome.alarms.create('chimeAlarm', {
      when: nextTime.getTime()
    });
  } else {
    const interval = settings.interval === 'custom'
      ? clampInterval(settings.customInterval, DEFAULT_SETTINGS.customInterval)
      : clampInterval(settings.interval, DEFAULT_SETTINGS.interval);
    const delayInMinutes = getDelayToNextInterval(now, interval);
    nextTime = new Date(now.getTime() + delayInMinutes * 60 * 1000);
    nextTime.setSeconds(0, 0);
    await chrome.alarms.create('chimeAlarm', {
      delayInMinutes,
      periodInMinutes: interval
    });
  }

  await notifyNextChimeTime('chimeAlarm', nextTime);
}

async function createDualTimerAlarm(dualTimer) {
  await clearAlarms();

  const shortInterval = clampInterval(dualTimer?.shortInterval, DEFAULT_SETTINGS.dualTimer.shortInterval);
  const longInterval = clampInterval(dualTimer?.longInterval, DEFAULT_SETTINGS.dualTimer.longInterval);
  const now = new Date();
  const nextLongTime = now.getTime() + getDelayToNextInterval(now, longInterval) * 60000;
  await chrome.storage.local.set({ dualSchedule: { nextLongTime, lastLongTime: null } });

  await chrome.alarms.create('shortTimer', {
    when: now.getTime() + getDelayToNextInterval(now, shortInterval) * 60000,
    periodInMinutes: shortInterval
  });

  await chrome.alarms.create('longTimer', {
    when: nextLongTime,
    periodInMinutes: longInterval
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
  await ensureOffscreenDocument();

  const isCustomSound = soundName.startsWith('custom_');
  let filename = '';
  let soundUrl = '';

  if (isCustomSound) {
    const { customSounds = [] } = await chrome.storage.local.get('customSounds');
    const customSound = customSounds.find((sound) => sound.value === soundName);
    if (!customSound) {
      return false;
    }
    filename = customSound.filename;
    soundUrl = customSound.data;
  } else {
    const soundInfo = await getSoundInfoFromJson(soundName);
    if (!soundInfo) {
      return false;
    }
    filename = soundInfo.filename;
  }

  await chrome.runtime.sendMessage({
    type: 'playSound',
    soundUrl,
    filename,
    volume: clampVolume(volume),
    isCustomSound
  });
  return true;
}

async function getSoundInfoFromJson(soundName) {
  try {
    const response = await fetch(chrome.runtime.getURL('sounds/sounds.json'));
    const data = await response.json();
    return data.sounds.find((sound) => sound.value === soundName);
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
  return chrome.storage.local.get(DEFAULT_SETTINGS);
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
    chimeCount: chimeCount + 1,
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
