/* 팝업의 설정 저장 경로를 하나로 모아 중복 예약과 닫기 시 재예약을 방지한다. */
(() => {
  'use strict';
  const defaults = {
    isActive: false, selectedSound: 'chime1', interval: '15', volume: 50,
    customInterval: 15, specificTime: '', repeatDaily: false, timerMode: 'single',
    dualTimer: { shortInterval: 15, longInterval: 60, shortSound: 'chime1', longSound: 'chime2' }
  };
  const byId = (id) => document.getElementById(id);
  const maxFileBytes = 1024 * 1024;
  let sounds = [];
  let operations = Promise.resolve();

  function status(message = '') { byId('settingsStatus').textContent = message; }
  // UI 이벤트 순서대로 저장한 뒤 서비스 워커의 완료 응답까지 기다린다.
  function enqueue(operation) {
    operations = operations.then(operation).catch((error) => {
      status(error.message || 'Could not save settings. Close and reopen the popup.');
      console.warn('설정 변경 실패:', error);
    });
    return operations;
  }
  async function notify(message) {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok) throw new Error(response?.error || 'Could not update the timer. Reopen the popup to retry.');
  }
  async function loadSettings() {
    const state = await chrome.storage.local.get(defaults);
    state.dualTimer = { ...defaults.dualTimer, ...(state.dualTimer || {}) };
    return state;
  }
  function currentMode() { return document.querySelector('input[name="timerMode"]:checked').value; }
  function preview(sound) { document.dispatchEvent(new CustomEvent('chime:preview', { detail: { sound } })); }
  function showMode(mode) {
    byId('singleSoundSection').hidden = mode !== 'single';
    byId('singleTimerSection').hidden = mode !== 'single';
    byId('dualTimerSection').hidden = mode !== 'dual';
    byId('dualTimerSection').style.display = '';
  }
  function showInterval() {
    byId('customIntervalContainer').style.display = byId('intervalSelect').value === 'custom' ? 'block' : 'none';
    byId('specificTimeContainer').style.display = byId('intervalSelect').value === 'specific' ? 'block' : 'none';
  }
  function readTimerForm() {
    return {
      timerMode: currentMode(), interval: byId('intervalSelect').value,
      customInterval: Number(byId('customIntervalInput').value),
      specificTime: byId('specificTimeInput').value, repeatDaily: byId('repeatDaily').checked,
      dualTimer: {
        shortInterval: Number(byId('shortIntervalSelect').value), longInterval: Number(byId('longIntervalSelect').value),
        shortSound: byId('shortTimerSound').value, longSound: byId('longTimerSound').value
      }
    };
  }
  function validate(settings) {
    const dualStatus = byId('dualTimerValidation');
    if (settings.timerMode === 'dual') {
      const { shortInterval: short, longInterval: long } = settings.dualTimer;
      const valid = Number.isInteger(short) && Number.isInteger(long) && short >= 1 && long <= 1440 && short < long && long % short === 0;
      dualStatus.textContent = valid
        ? `Timer 1 every ${short} minutes; Timer 2 every ${long} minutes. Timer 2 takes priority when both are due.`
        : 'Timer 2 must be longer than, and an exact multiple of, Timer 1. The previous schedule is unchanged.';
      document.querySelector('.dual-timer-status').classList.toggle('error', !valid);
      if (!valid) throw new Error(dualStatus.textContent);
    } else if (settings.interval === 'custom') {
      if (!Number.isInteger(settings.customInterval) || settings.customInterval < 1 || settings.customInterval > 1440) {
        throw new Error('Enter a whole number from 1 to 1,440 minutes. The previous schedule is unchanged.');
      }
    } else if (settings.interval === 'specific') {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.specificTime)) {
        throw new Error('Choose a time before turning on this reminder. The previous schedule is unchanged.');
      }
    } else if (!['15', '30', '60'].includes(settings.interval)) {
      throw new Error('Choose a valid interval.');
    }
  }
  function activeTimerFields(settings) {
    // 검증한 현재 모드/간격의 필드만 저장한다. 숨겨진 입력의 거절된 초안은 저장값을 덮지 않는다.
    if (settings.timerMode === 'dual') return { timerMode: 'dual', dualTimer: settings.dualTimer };
    const fields = { timerMode: 'single', interval: settings.interval };
    if (settings.interval === 'custom') fields.customInterval = settings.customInterval;
    if (settings.interval === 'specific') {
      fields.specificTime = settings.specificTime;
      fields.repeatDaily = settings.repeatDaily;
    }
    return fields;
  }
  function restoreInactiveFields(saved, submitted) {
    // 새 입력이 이미 시작됐다면 이전 작업이 UI를 되돌리지 않는다. 숨긴 초안만 마지막 저장값으로 복구한다.
    if (currentMode() !== submitted.timerMode) return;
    if (submitted.timerMode === 'single' && byId('intervalSelect').value !== submitted.interval) return;
    if (submitted.timerMode === 'dual') byId('intervalSelect').value = String(saved.interval);
    if (submitted.timerMode === 'dual' || submitted.interval !== 'custom') {
      byId('customIntervalInput').value = saved.customInterval;
    }
    if (submitted.timerMode === 'dual' || submitted.interval !== 'specific') {
      byId('specificTimeInput').value = saved.specificTime;
      byId('repeatDaily').checked = saved.repeatDaily === true;
    }
    if (submitted.timerMode === 'single') {
      byId('shortIntervalSelect').value = saved.dualTimer.shortInterval;
      byId('longIntervalSelect').value = saved.dualTimer.longInterval;
      byId('shortTimerSound').value = saved.dualTimer.shortSound;
      byId('longTimerSound').value = saved.dualTimer.longSound;
    }
    showInterval();
  }
  async function saveActiveTimer(settings, extra = {}) {
    validate(settings);
    const saved = await loadSettings();
    const fields = activeTimerFields(settings);
    await chrome.storage.local.set({ ...fields, ...extra });
    restoreInactiveFields({ ...saved, ...fields }, settings);
    return fields;
  }
  function saveTimerForm() {
    // 입력 순간의 스냅샷을 저장해 뒤늦게 실행되는 작업이 새 입력을 덮지 않게 한다.
    const settings = readTimerForm();
    return enqueue(async () => {
      const fields = await saveActiveTimer(settings);
      await notify(fields.timerMode === 'dual'
        ? { type: 'updateDualTimer', dualTimer: fields.dualTimer }
        : { action: 'updateAlarm', ...fields });
      status();
    });
  }
  async function refreshSounds(selected) {
    const response = await fetch(chrome.runtime.getURL('sounds/sounds.json'));
    const catalog = await response.json();
    const { customSounds = [] } = await chrome.storage.local.get('customSounds');
    sounds = [...catalog.sounds, ...(Array.isArray(customSounds) ? customSounds.filter((item) => item && typeof item.value === 'string' && item.value.startsWith('custom_') && typeof item.name === 'string') : [])];
    const existing = await loadSettings();
    const chosen = sounds.some((item) => item.value === selected) ? selected : defaults.selectedSound;
    const options = byId('soundOptions');
    options.replaceChildren();
    for (const sound of sounds) {
      const label = document.createElement('label');
      const radio = document.createElement('input');
      radio.type = 'radio'; radio.name = 'sound'; radio.value = sound.value; radio.checked = sound.value === chosen;
      const name = document.createElement('span');
      // 업로드 파일 이름은 HTML이 아니라 텍스트 노드로만 표시한다.
      name.textContent = sound.name;
      label.append(radio, name);
      if (sound.value.startsWith('custom_')) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'delete-btn sound-delete-btn'; button.textContent = '×';
        button.title = 'Delete sound'; button.setAttribute('aria-label', `Delete ${sound.name}`);
        button.addEventListener('click', (event) => {
          event.preventDefault();
          void enqueue(() => deleteSound(sound.value));
        });
        label.append(button);
      }
      options.append(label);
    }
    for (const [id, field, fallback] of [['shortTimerSound', 'shortSound', 'chime1'], ['longTimerSound', 'longSound', 'chime2']]) {
      const select = byId(id);
      select.replaceChildren();
      for (const sound of sounds) {
        const option = document.createElement('option');
        option.value = sound.value; option.textContent = sound.name; select.append(option);
      }
      select.value = sounds.some((sound) => sound.value === existing.dualTimer[field]) ? existing.dualTimer[field] : fallback;
    }
    // 삭제되었거나 손상된 소리 참조만 복구하며 실행 중인 예약 시각은 바꾸지 않는다.
    const dualTimer = { ...existing.dualTimer, shortSound: byId('shortTimerSound').value, longSound: byId('longTimerSound').value };
    if (chosen !== existing.selectedSound || dualTimer.shortSound !== existing.dualTimer.shortSound || dualTimer.longSound !== existing.dualTimer.longSound) {
      await chrome.storage.local.set({ selectedSound: chosen, dualTimer });
    }
  }
  async function deleteSound(value) {
    const state = await loadSettings();
    const { customSounds = [] } = await chrome.storage.local.get('customSounds');
    const dualTimer = { ...state.dualTimer };
    if (dualTimer.shortSound === value) dualTimer.shortSound = defaults.dualTimer.shortSound;
    if (dualTimer.longSound === value) dualTimer.longSound = defaults.dualTimer.longSound;
    const selectedSound = state.selectedSound === value ? defaults.selectedSound : state.selectedSound;
    await chrome.storage.local.set({ customSounds: customSounds.filter((item) => item.value !== value), selectedSound, dualTimer });
    await refreshSounds(selectedSound);
    status('Sound deleted. Any timer using it now uses a built-in chime.');
  }
  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read this audio file. Try it again.'));
      reader.readAsDataURL(file);
    });
  }
  async function uploadSound(file) {
    if (!file.size || file.size > maxFileBytes) throw new Error('Choose a non-empty audio file up to 1 MB.');
    // OS가 MIME 유형을 제공하지 않는 MP3/WAV도 허용하되 저장되는 데이터 유형은 검증한다.
    const mime = file.type || (/\.mp3$/i.test(file.name) ? 'audio/mpeg' : /\.wav$/i.test(file.name) ? 'audio/wav' : '');
    if (!/^audio\/(mpeg|mp3|wav|x-wav|wave|vnd\.wave|ogg|mp4|x-m4a|aac|flac|x-flac|opus|webm)$/i.test(mime)) {
      throw new Error('Choose a supported audio file, such as MP3 or WAV.');
    }
    const data = await readFile(new Blob([file], { type: mime }));
    const { customSounds = [] } = await chrome.storage.local.get('customSounds');
    const sound = { value: `custom_${crypto.randomUUID()}`, name: file.name.replace(/\.[^/.]+$/, '') || file.name, filename: file.name, data };
    await chrome.storage.local.set({ customSounds: [...customSounds, sound], selectedSound: sound.value });
    await refreshSounds(sound.value);
    preview(sound.value);
    status('Sound saved locally. Test it before relying on a reminder.');
  }
  async function initReviews() {
    const url = `https://chromewebstore.google.com/detail/${chrome.runtime.id}/reviews`;
    byId('rateBtn').href = url; byId('rateNowBtn').href = url;
    const state = await chrome.storage.local.get({ installedAt: 0, chimeCount: 0, reviewPrompt: {} });
    const review = state.reviewPrompt || {};
    if (state.installedAt && Date.now() - state.installedAt >= 3 * 86400000 && state.chimeCount >= 10 && !review.dontAskAgain && !review.clickedRateAt && (review.promptCount || 0) < 3 && (!review.lastPromptAt || Date.now() - review.lastPromptAt >= 14 * 86400000)) {
      await chrome.storage.local.set({ reviewPrompt: { ...review, lastPromptAt: Date.now(), promptCount: (review.promptCount || 0) + 1 } });
      byId('reviewPrompt').style.display = 'block';
    }
    for (const id of ['rateNowBtn', 'rateLaterBtn', 'rateNeverBtn']) {
      byId(id).addEventListener('click', () => { void enqueue(async () => {
        const { reviewPrompt = {} } = await chrome.storage.local.get('reviewPrompt');
        const change = id === 'rateLaterBtn' ? { lastPromptAt: Date.now() } : { dontAskAgain: true, ...(id === 'rateNowBtn' ? { clickedRateAt: Date.now() } : {}) };
        await chrome.storage.local.set({ reviewPrompt: { ...reviewPrompt, ...change } });
        byId('reviewPrompt').style.display = 'none';
      }); });
    }
  }
  async function init() {
    const state = await loadSettings();
    const mode = state.timerMode === 'dual' ? 'dual' : 'single';
    document.querySelector(`input[name="timerMode"][value="${mode}"]`).checked = true;
    byId('timerToggle').checked = state.isActive === true;
    byId('intervalSelect').value = String(state.interval);
    byId('customIntervalInput').value = state.customInterval;
    byId('specificTimeInput').value = state.specificTime;
    byId('repeatDaily').checked = state.repeatDaily === true;
    byId('shortIntervalSelect').value = state.dualTimer.shortInterval;
    byId('longIntervalSelect').value = state.dualTimer.longInterval;
    byId('volumeSlider').value = Number.isFinite(Number(state.volume)) ? Math.max(0, Math.min(100, Number(state.volume))) : 50;
    byId('volumeValue').textContent = `${byId('volumeSlider').value}%`;
    await refreshSounds(state.selectedSound);
    showMode(mode); showInterval();
    byId('timerToggle').addEventListener('change', () => {
      const isActive = byId('timerToggle').checked;
      const settings = readTimerForm();
      void enqueue(async () => {
        try {
          if (isActive) await saveActiveTimer(settings, { isActive });
          else await chrome.storage.local.set({ isActive });
          await notify({ type: 'toggleTimer', isActive });
          status();
        } catch (error) {
          byId('timerToggle').checked = (await loadSettings()).isActive;
          throw error;
        }
      });
    });
    document.querySelectorAll('input[name="timerMode"]').forEach((input) => input.addEventListener('change', () => {
      showMode(currentMode()); void saveTimerForm();
    }));
    byId('intervalSelect').addEventListener('change', () => { showInterval(); void saveTimerForm(); });
    for (const id of ['customIntervalInput', 'specificTimeInput', 'repeatDaily', 'shortIntervalSelect', 'longIntervalSelect']) {
      byId(id).addEventListener('change', () => { void saveTimerForm(); });
    }
    byId('soundOptions').addEventListener('change', (event) => {
      if (event.target.name !== 'sound') return;
      const selectedSound = event.target.value;
      void enqueue(async () => { await chrome.storage.local.set({ selectedSound }); preview(selectedSound); status(); });
    });
    for (const [id, field] of [['shortTimerSound', 'shortSound'], ['longTimerSound', 'longSound']]) {
      byId(id).addEventListener('change', () => {
        const sound = byId(id).value;
        void enqueue(async () => {
          const { dualTimer } = await loadSettings();
          await chrome.storage.local.set({ dualTimer: { ...dualTimer, [field]: sound } });
          preview(sound); status();
        });
      });
    }
    byId('volumeSlider').addEventListener('input', () => { byId('volumeValue').textContent = `${byId('volumeSlider').value}%`; });
    byId('volumeSlider').addEventListener('change', () => {
      const volume = Number(byId('volumeSlider').value);
      void enqueue(async () => {
        await chrome.storage.local.set({ volume });
        const state = await loadSettings(); preview(state.timerMode === 'dual' ? state.dualTimer.shortSound : state.selectedSound);
      });
    });
    byId('addCustomSound').addEventListener('click', () => { byId('customSoundInput').click(); });
    byId('customSoundInput').addEventListener('change', () => {
      const file = byId('customSoundInput').files[0];
      if (file) void enqueue(async () => {
        try { await uploadSound(file); } finally { byId('customSoundInput').value = ''; }
      });
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.isActive) byId('timerToggle').checked = changes.isActive.newValue === true;
    });
    // 저장 직후 팝업이 닫혔어도 다음 열기에서 실제 예약을 복구한다.
    byId('timerToggle').disabled = false;
    await notify({ type: 'syncTimer' });
    await initReviews();
  }
  document.addEventListener('DOMContentLoaded', () => {
    void init().catch((error) => { status(`Setup could not finish: ${error.message}. Close and reopen the popup.`); console.warn(error); });
  });
})();
