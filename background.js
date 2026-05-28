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
  volume: 50
};

const MIN_INTERVAL_MINUTES = 1;
const MAX_INTERVAL_MINUTES = 1440;

chrome.runtime.onInstalled.addListener((details) => {
  void handleInstalled(details);
});

chrome.runtime.onStartup.addListener(() => {
  void handleStartup();
});

chrome.runtime.onMessage.addListener((message) => {
  void handleMessage(message);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  void handleAlarm(alarm);
});

async function handleInstalled(details) {
  await ensureOffscreenDocument();
  await ensureInstalledAt();
  clearUninstallRedirect();
  await restoreActiveTimer();

  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'welcome.html' });
  }
}

async function handleStartup() {
  await ensureOffscreenDocument();
  clearUninstallRedirect();
  await restoreActiveTimer();
}

async function handleMessage(message) {
  if (message.action === 'updateAlarm') {
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
      await restoreActiveTimer();
    } else {
      await clearAlarms();
    }
    await setBadge(Boolean(message.isActive));
    return;
  }

  if (message.type === 'updateDualTimer') {
    const { isActive } = await chrome.storage.local.get('isActive');
    if (isActive) {
      await createDualTimerAlarm(message.dualTimer);
    }
  }
}

async function handleAlarm(alarm) {
  const settings = await loadSettings();
  if (!settings.isActive) {
    return;
  }

  const sound = pickSoundForAlarm(alarm.name, settings);
  if (!sound) {
    return;
  }

  await incrementChimeCount();
  await playSound(sound, settings.volume);

  if (alarm.name === 'chimeAlarm') {
    await notifyNextChimeTime('chimeAlarm');
  }
}

function pickSoundForAlarm(alarmName, settings) {
  if (alarmName === 'chimeAlarm') {
    return settings.selectedSound || DEFAULT_SETTINGS.selectedSound;
  }

  if (settings.timerMode !== 'dual' || !settings.dualTimer) {
    return null;
  }

  if (alarmName === 'longTimer') {
    return settings.dualTimer.longSound;
  }

  if (alarmName === 'shortTimer') {
    const minute = new Date().getMinutes();
    const longInterval = clampInterval(settings.dualTimer.longInterval, 60);
    return minute % longInterval === 0
      ? settings.dualTimer.longSound
      : settings.dualTimer.shortSound;
  }

  return null;
}

async function restoreActiveTimer() {
  const settings = await loadSettings();
  await setBadge(settings.isActive);

  if (!settings.isActive) {
    return;
  }

  if (settings.timerMode === 'dual' && settings.dualTimer) {
    await createDualTimerAlarm(settings.dualTimer);
  } else {
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
      when: nextTime.getTime(),
      periodInMinutes: settings.repeatDaily ? 1440 : undefined
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

  await chrome.alarms.create('shortTimer', {
    delayInMinutes: getDelayToNextInterval(new Date(), shortInterval),
    periodInMinutes: shortInterval
  });

  await chrome.alarms.create('longTimer', {
    delayInMinutes: getDelayToNextInterval(new Date(), longInterval),
    periodInMinutes: longInterval
  });
}

async function clearAlarms() {
  await chrome.alarms.clearAll();
}

function getDelayToNextInterval(now, interval) {
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
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
      return;
    }
    filename = customSound.filename;
    soundUrl = customSound.data;
  } else {
    const soundInfo = await getSoundInfoFromJson(soundName);
    if (!soundInfo) {
      return;
    }
    filename = soundInfo.filename;
  }

  chrome.runtime.sendMessage({
    type: 'playSound',
    soundUrl,
    filename,
    volume: clampVolume(volume),
    isCustomSound
  });
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
  if (await chrome.offscreen.hasDocument()) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: 'audio-player.html',
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Playing alarm sound'
  });
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
