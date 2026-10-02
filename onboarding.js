/* 기존 팝업 번들을 수정하지 않고 안내, 실제 알람 조회, 수동 소리 테스트를 추가한다. */
(() => {
  'use strict';

  const messages = {
    en: {
      guideLink: 'Setup guide', timerActive: 'Timer Active', quickStart: 'Quick start · 3 steps',
      quickStep1: 'Choose a sound and volume. Use Test selected sound to listen.',
      quickStep2: 'Choose an interval or specific time below. For a 25-minute focus cue, choose Custom interval and enter 25.',
      quickStep3: 'Turn Timer Active on, then check the scheduled chime above.',
      awakeNote: 'Keep Chrome running and your device awake. Sleep can delay chimes.',
      testSound: 'Test selected sound', testShort: 'Test Timer 1', testLong: 'Test Timer 2',
      off: 'OFF · Choose your settings, test the sound, then turn Timer Active on.',
      noSchedule: 'No chime scheduled. Check your time settings, then turn the timer off and on.',
      next: 'Next scheduled chime: ', timer1: 'Timer 1: ', timer2: 'Timer 2: ',
      missing: 'Not scheduled', statusError: 'Could not read the schedule. Close and reopen this popup.',
      muted: 'Volume is 0%. Raise the volume below before testing.',
      loading: 'Loading selected sound…', playing: 'Playing. If silent, check device volume and audio output.',
      finished: 'Test finished. If you heard it, your preview works. Turn Timer Active on to schedule chimes.',
      failed: 'Could not play this sound. Try another sound or upload it again.',
      welcomeTitle: 'Your first chime, in 3 steps',
      welcomeIntro: 'Simple audio cues for focus, breaks, and keeping track of time.',
      pinTitle: '1. Open the timer',
      pinBody: 'In Chrome, click Extensions (the puzzle-piece icon), then Airplane Chime Timer. Pin it for quick access.',
      testTitle: '2. Choose and test a sound',
      testBody: 'Choose Chime Sound and Volume in the popup. Click Test selected sound. The timer can stay OFF while you set it up.',
      enableTitle: '3. Set the timing and turn it on',
      enableBody: 'Choose Interval or Time, then turn Timer Active on. Check Next scheduled chime. The popup can be closed after setup.',
      timingTitle: 'Choose the cue that fits your routine',
      singleBody: 'Single Timer: repeat one sound every 15, 30, or 60 minutes, or enter a custom interval from 1 to 1,440 minutes.',
      focusBody: 'For a 25-minute focus cue: Single Timer → Custom interval → 25. This repeats one interval; it does not alternate 25-minute work and 5-minute break sessions.',
      specificBody: 'Specific time: choose a time of day, and optionally Repeat daily. Check the displayed date if that time has already passed today.',
      dualBody: 'Dual Timer: choose two intervals and sounds. Timer 2 must be a multiple of Timer 1. When both are due together, Timer 2 takes priority.',
      troubleshootingTitle: 'No sound? Check these first',
      troubleshooting1: 'Run a sound test with volume above 0%. Check your device volume, mute setting, and connected headphones or speakers.',
      troubleshooting2: 'Check Timer Active and the scheduled chime shown in the popup. Selecting a sound only previews it; it does not turn the timer on.',
      troubleshooting3: 'On a Chromebook or laptop, closing the lid can put the device to sleep. Keep the device awake and Chrome running for scheduled chimes.',
      timingNote: 'Times are scheduled targets. Chrome or device sleep can delay playback; exact second timing is not guaranteed.',
      privacyNote: 'Settings and uploaded sounds stay in Chrome local storage. No account or tracking is required.',
      returnNote: 'Ready? Open Airplane Chime Timer from Chrome’s Extensions menu to start.',
      feedbackLabel: 'Questions or feedback: '
    },
    ko: {
      guideLink: '사용 안내', timerActive: '타이머 켜기', quickStart: '빠른 시작 · 3단계',
      quickStep1: '소리와 볼륨을 고르고 ‘선택한 소리 테스트’로 들어봐.',
      quickStep2: '아래에서 간격이나 시각을 골라. 25분 집중 알림은 Custom interval에 25를 입력하면 돼.',
      quickStep3: '타이머를 켜고 위에 표시되는 예약 시각을 확인해.',
      awakeNote: 'Chrome이 실행 중이고 기기가 깨어 있어야 해. 절전 중에는 알림이 늦어질 수 있어.',
      testSound: '선택한 소리 테스트', testShort: '타이머 1 테스트', testLong: '타이머 2 테스트',
      off: '꺼짐 · 설정과 소리 테스트를 마친 뒤 타이머를 켜줘.',
      noSchedule: '예약된 알림이 없어. 시각 설정을 확인하고 타이머를 껐다 켜줘.',
      next: '다음 예약 알림: ', timer1: '타이머 1: ', timer2: '타이머 2: ',
      missing: '예약 없음', statusError: '예약 상태를 읽지 못했어. 팝업을 닫았다 다시 열어줘.',
      muted: '볼륨이 0%야. 아래에서 볼륨을 올린 뒤 테스트해줘.',
      loading: '선택한 소리를 불러오는 중…', playing: '재생 중이야. 안 들리면 기기 볼륨과 출력 장치를 확인해줘.',
      finished: '테스트가 끝났어. 소리가 들렸다면 미리 듣기는 정상 동작해. 알림을 예약하려면 타이머를 켜줘.',
      failed: '소리를 재생하지 못했어. 다른 소리를 고르거나 파일을 다시 올려줘.',
      welcomeTitle: '첫 알림까지 3단계',
      welcomeIntro: '집중, 휴식, 시간 확인을 위한 간단한 소리 알림이야.',
      pinTitle: '1. 타이머 열기',
      pinBody: 'Chrome의 확장 프로그램(퍼즐 모양) 메뉴에서 Airplane Chime Timer를 눌러. 고정해 두면 쉽게 열 수 있어.',
      testTitle: '2. 소리 선택하고 테스트하기',
      testBody: '팝업의 Chime Sound와 Volume에서 소리와 볼륨을 골라. ‘선택한 소리 테스트’를 눌러 들어봐. 설정하는 동안 타이머는 꺼져 있어도 돼.',
      enableTitle: '3. 시간 설정하고 켜기',
      enableBody: 'Interval or Time에서 간격이나 시각을 정하고 타이머를 켜줘. 다음 예약 알림을 확인하면 돼. 설정 후 팝업은 닫아도 돼.',
      timingTitle: '내 루틴에 맞는 알림 고르기',
      singleBody: 'Single Timer: 같은 소리를 15분, 30분, 60분마다 반복해. Custom interval에는 1~1,440분을 직접 입력할 수 있어.',
      focusBody: '25분 집중 알림: Single Timer → Custom interval → 25. 같은 간격을 반복하는 기능이고, 25분 집중과 5분 휴식을 자동으로 번갈아 실행하지는 않아.',
      specificBody: 'Specific time: 하루 중 원하는 시각을 골라. 매일 반복하려면 Repeat daily를 체크해. 오늘 이미 지난 시각이라면 표시된 날짜도 확인해줘.',
      dualBody: 'Dual Timer: 두 간격과 소리를 정해. 타이머 2의 간격은 타이머 1의 배수여야 해. 두 알림 시각이 겹치면 타이머 2 소리가 우선해.',
      troubleshootingTitle: '소리가 안 들리면 먼저 확인해',
      troubleshooting1: '볼륨을 0%보다 높게 설정하고 소리 테스트를 해봐. 기기 볼륨, 음소거, 연결된 헤드폰이나 스피커도 확인해줘.',
      troubleshooting2: '팝업에서 타이머가 켜졌는지와 예약 시각을 확인해. 소리를 선택하면 미리 듣기만 실행되고 타이머가 켜지지는 않아.',
      troubleshooting3: 'Chromebook이나 노트북의 덮개를 닫으면 절전 상태가 될 수 있어. 예약 알림을 들으려면 기기를 깨어 있게 유지하고 Chrome을 실행해 둬.',
      timingNote: '표시된 시각은 예약 목표야. Chrome이나 기기의 절전 상태 때문에 재생이 늦어질 수 있고, 정확한 초 단위 실행을 보장하지 않아.',
      privacyNote: '설정과 업로드한 소리는 Chrome 로컬 저장소에 보관돼. 계정이나 추적 기능은 없어.',
      returnNote: '준비됐으면 Chrome 확장 프로그램 메뉴에서 Airplane Chime Timer를 열어 시작해봐.',
      feedbackLabel: '문의와 의견: '
    }
  };
  let language = navigator.language.toLowerCase().startsWith('ko') ? 'ko' : 'en';
  let lastTestMessage = '';
  let refreshVersion = 0;
  let preview;
  const byId = (id) => document.getElementById(id);
  const text = (key) => messages[language][key];

  // 같은 내용을 반복 기록하지 않아 스크린 리더의 불필요한 상태 안내를 피한다.
  function setText(element, value) {
    if (element && element.textContent !== value) element.textContent = value;
  }

  function applyLanguage(value) {
    language = value === 'ko' ? 'ko' : 'en';
    document.documentElement.lang = language;
    document.querySelectorAll('[data-guide-key]').forEach((element) => {
      setText(element, text(element.dataset.guideKey));
    });
    document.querySelectorAll('[data-guide-language]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.guideLanguage === language));
    });
    if (lastTestMessage) setText(byId('soundTestStatus'), text(lastTestMessage));
  }

  function showTestStatus(key) {
    lastTestMessage = key;
    setText(byId('soundTestStatus'), text(key));
  }

  function formatAlarm(alarm) {
    if (!alarm || !Number.isFinite(alarm.scheduledTime)) return text('missing');
    const date = new Date(alarm.scheduledTime);
    const isToday = date.toDateString() === new Date().toDateString();
    return date.toLocaleString(language, {
      ...(isToday ? {} : { month: 'short', day: 'numeric' }),
      hour: '2-digit', minute: '2-digit'
    });
  }

  async function refreshSchedule() {
    if (!byId('scheduleStatus')) return;
    const version = ++refreshVersion;
    try {
      const [settings, alarms] = await Promise.all([
        chrome.storage.local.get({ isActive: false, timerMode: 'single' }),
        chrome.alarms.getAll()
      ]);
      if (version !== refreshVersion) return;
      const dual = settings.timerMode === 'dual';
      setText(byId('testSelectedSound'), text(dual ? 'testShort' : 'testSound'));
      setText(byId('testLongSound'), text('testLong'));
      byId('testLongSound').hidden = !dual;
      let status = text('off');
      if (settings.isActive) {
        // 실제 등록된 알람만 보여주며 설정값으로 미래 시각을 추산하지 않는다.
        if (dual) {
          const shortAlarm = alarms.find((alarm) => alarm.name === 'shortTimer');
          const longAlarm = alarms.find((alarm) => alarm.name === 'longTimer');
          status = shortAlarm || longAlarm
            ? `${text('timer1')}${formatAlarm(shortAlarm)}\n${text('timer2')}${formatAlarm(longAlarm)}`
            : text('noSchedule');
        } else {
          const alarm = alarms.find((item) => item.name === 'chimeAlarm');
          status = alarm ? `${text('next')}${formatAlarm(alarm)}` : text('noSchedule');
        }
      }
      setText(byId('scheduleStatus'), status);
    } catch (error) {
      if (version === refreshVersion) setText(byId('scheduleStatus'), text('statusError'));
      console.warn('예약 상태 조회 실패:', error);
    }
  }

  async function testSound(longTimer = false) {
    const buttons = [byId('testSelectedSound'), byId('testLongSound')];
    buttons.forEach((button) => { button.disabled = true; });
    try {
      const settings = await chrome.storage.local.get({
        selectedSound: 'chime1', volume: 50, timerMode: 'single', customSounds: [],
        dualTimer: { shortSound: 'chime1', longSound: 'chime2' }
      });
      const volume = Math.max(0, Math.min(100, Number(byId('volumeSlider').value)));
      if (!volume) { showTestStatus('muted'); return; }
      const sound = settings.timerMode === 'dual'
        ? settings.dualTimer[longTimer ? 'longSound' : 'shortSound']
        : settings.selectedSound;
      showTestStatus('loading');
      let source;
      if (sound.startsWith('custom_')) {
        source = settings.customSounds.find((item) => item.value === sound)?.data;
        if (!source || !source.startsWith('data:audio/')) throw new Error('사용자 소리가 없어');
      } else {
        const response = await fetch(chrome.runtime.getURL('sounds/sounds.json'));
        const catalog = await response.json();
        const entry = catalog.sounds.find((item) => item.value === sound);
        if (!entry) throw new Error('소리 목록에 없는 값이야');
        source = chrome.runtime.getURL(`sounds/${entry.filename}`);
      }
      if (preview) preview.pause();
      preview = new Audio(source);
      preview.volume = volume / 100;
      preview.addEventListener('ended', () => showTestStatus('finished'));
      preview.addEventListener('error', () => showTestStatus('failed'));
      await preview.play();
      showTestStatus('playing');
    } catch (error) {
      showTestStatus('failed');
      console.warn('소리 테스트 실패:', error);
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
    }
  }

  async function init() {
    try {
      const { guideLanguage } = await chrome.storage.local.get('guideLanguage');
      if (guideLanguage === 'en' || guideLanguage === 'ko') language = guideLanguage;
    } catch (error) {
      console.warn('안내 언어 조회 실패:', error);
    }
    applyLanguage(language);
    document.querySelectorAll('[data-guide-language]').forEach((button) => {
      button.addEventListener('click', async () => {
        applyLanguage(button.dataset.guideLanguage);
        void refreshSchedule();
        try { await chrome.storage.local.set({ guideLanguage: language }); }
        catch (error) { console.warn('안내 언어 저장 실패:', error); }
      });
    });
    if (!byId('scheduleStatus')) return;
    document.querySelector('.next-chime-container').hidden = true;
    byId('scheduleStatus').hidden = false;
    byId('testSelectedSound').addEventListener('click', () => { void testSound(); });
    byId('testLongSound').addEventListener('click', () => { void testSound(true); });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.guideLanguage) applyLanguage(changes.guideLanguage.newValue);
      // 특정 시각 1회 알림 종료처럼 백그라운드에서 끈 상태도 열린 팝업에 반영한다.
      if (changes.isActive) byId('timerToggle').checked = Boolean(changes.isActive.newValue);
      void refreshSchedule();
    });
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'updateNextChimeTime') void refreshSchedule();
    });
    // 팝업이 열린 동안의 상태 조회용이며 알람 예약이나 실행에는 관여하지 않는다.
    const refreshTimer = window.setInterval(() => { void refreshSchedule(); }, 2000);
    window.addEventListener('unload', () => {
      window.clearInterval(refreshTimer);
      if (preview) preview.pause();
    });
    await refreshSchedule();
  }

  document.addEventListener('DOMContentLoaded', () => { void init(); });
})();
