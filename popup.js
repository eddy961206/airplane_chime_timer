import $ from 'jquery';

// [설명] 이 파일은 팝업 페이지 로딩 시 동작하는 코드로, UI 초기화, 이벤트 리스너 등록, 사용자 설정 로드/저장 등을 담당한다.
// 주석은 모두 한국어로 달며, UI에 표시되는 텍스트는 영어로 유지한다.
// 콘솔 로그 또한 한국어로 작성하여 개발자 이해를 돕는다.

// ----------------------------- Settings 관리 객체 -----------------------------
// [역할] 확장 프로그램의 설정값(알림 활성화 여부, 선택된 사운드, 인터벌 시간, 볼륨 등)을
//        크롬 스토리지에서 로드/저장하는 역할을 한다.
const Settings = {
    // 설정값 저장 함수
    save: async function(settings) {
        await chrome.storage.local.set(settings);
        // 사운드 관련 설정 변경 시 background script에 업데이트 요청
        if (settings.selectedSound !== undefined || settings.volume !== undefined) {
            chrome.runtime.sendMessage({ type: 'updateSound' });
        }
    },

    // 설정값 로드 함수 - 듀얼 타이머 지원 추가
    load: async function() {
        return chrome.storage.local.get({
            // 기존 단일 타이머 설정
            isActive: false,
            selectedSound: 'chime1',
            interval: 15,
            volume: 50,
            customInterval: 15,
            specificTime: '',
            repeatDaily: false,
            // 듀얼 타이머 설정 추가
            timerMode: 'single', // 'single' 또는 'dual'
            dualTimer: {
                shortInterval: 15,
                longInterval: 60,
                shortSound: 'chime1',
                longSound: 'chime2'
            }
        });
    }
};

// ----------------------------- DualTimerManager (듀얼 타이머 관리) -----------------------------
// [역할] 듀얼 타이머 설정 검증, UI 관리, 알람 설정 등을 담당
const DualTimerManager = {
    // 두 주기가 겹치는 주기인지 검증
    validateIntervals: function(shortInterval, longInterval) {
        const short = parseInt(shortInterval);
        const long = parseInt(longInterval);
        
        // 기본 유효성 검사
        if (short >= long) {
            return {
                valid: false,
                message: 'Timer 1 interval must be shorter than Timer 2 interval.'
            };
        }
        
        // 겹치는 주기 검사 - 긴 주기가 짧은 주기의 배수인지 확인
        const isCompatible = (long % short === 0);
        
        if (!isCompatible) {
            return {
                valid: false, 
                message: `Timer 2 (${long} min) must be a multiple of Timer 1 (${short} min) for proper dual timer operation.`
            };
        }
        
        return {
            valid: true,
            message: `Setup complete: Timer 1 every ${short} minutes, Timer 2 every ${long} minutes with priority overlap`
        };
    },
    
    // 사운드 옵션 UI 생성
    populateSoundSelects: async function() {
        const sounds = await SoundManager.getSoundFiles();
        const $shortSelect = $('#shortTimerSound');
        const $longSelect = $('#longTimerSound');
        
        // 선택 목록 초기화
        $shortSelect.empty();
        $longSelect.empty();
        
        sounds.forEach(sound => {
            const $option = $('<option>', {
                value: sound.value,
                text: sound.name
            });
            $shortSelect.append($option.clone());
            $longSelect.append($option.clone());
        });
        
        return sounds;
    },
    
    // 듀얼 타이머 설정 UI 업데이트
    updateValidationStatus: function(validation) {
        const $statusDiv = $('.dual-timer-status');
        const $messageSpan = $('#dualTimerValidation');
        
        // 상태에 따른 스타일 업데이트
        $statusDiv.removeClass('warning error');
        
        if (validation.valid) {
            $statusDiv.addClass('success');
        } else {
            $statusDiv.addClass('error');
        }
        
        $messageSpan.text(validation.message);
    },
    
    // 듀얼 타이머 설정 저장
    saveDualTimerSettings: async function() {
        const shortInterval = parseInt($('#shortIntervalSelect').val());
        const longInterval = parseInt($('#longIntervalSelect').val());
        const shortSound = $('#shortTimerSound').val();
        const longSound = $('#longTimerSound').val();
        
        const validation = this.validateIntervals(shortInterval, longInterval);
        this.updateValidationStatus(validation);
        
        if (validation.valid) {
            await Settings.save({
                timerMode: 'dual',
                dualTimer: {
                    shortInterval,
                    longInterval,
                    shortSound,
                    longSound
                }
            });
            
            // 백그라운드에 듀얼 타이머 설정 전송
            chrome.runtime.sendMessage({
                type: 'updateDualTimer',
                dualTimer: {
                    shortInterval,
                    longInterval,
                    shortSound,
                    longSound
                }
            });
        }
        
        return validation.valid;
    }
};

// ----------------------------- SoundManager (사운드 관련 관리) -----------------------------
// [역할] sounds.json 및 스토리지에 저장된 커스텀 사운드 목록을 관리하고,
//        사운드 옵션 UI를 동적으로 생성하며, 커스텀 사운드 추가/삭제 등을 담당한다.
const SoundManager = {
    // 사운드 파일 목록 가져오기(기본 + 커스텀)
    getSoundFiles: async function() {
        try {
            const response = await fetch(chrome.runtime.getURL('sounds/sounds.json'));
            const data = await response.json();
            
            const { customSounds = [] } = await chrome.storage.local.get('customSounds');
            
            // 기본 사운드 + 커스텀 사운드 합치기
            return [...data.sounds, ...customSounds];
        } catch (error) {
            console.error('사운드 파일 목록 로드 실패:', error);
            return [];
        }
    },

    // 사운드 옵션 UI 생성
    createSoundOptionsUI: async function(selectedSound) {
        const sounds = await this.getSoundFiles();
        const $container = $('#soundOptions');
        $container.empty();

        // 기본값으로 첫번째 사운드 선택 (기존 설정이 없다면)
        if (!selectedSound && sounds.length > 0) {
            selectedSound = sounds[0].value;
            await Settings.save({ selectedSound });
        }

        sounds.forEach(sound => {
            const $label = $('<label>');
            const $input = $('<input>', {
                type: 'radio',
                name: 'sound',
                value: sound.value,
                checked: sound.value === selectedSound
            });
            
            $label.append($input);
            $label.append(sound.name);

            // 커스텀 사운드의 경우 삭제 버튼 추가
            if (sound.value.startsWith('custom_')) {
                const $deleteBtn = $('<button>', {
                    class: 'delete-btn sound-delete-btn',
                    html: '&times;',
                    title: 'Delete sound'
                }).on('click', (e) => {
                    e.preventDefault(); // 라디오 버튼 선택 방지
                    this.deleteCustomSound(sound.value);
                });
                
                $label.append($deleteBtn);
            }
            
            $container.append($label);
        });

        return sounds;
    },

    // 커스텀 사운드 추가 처리
    handleCustomSound: async function(file) {
        try {
            // 파일 크기 제한 (1MB)
            if (file.size > 1024 * 1024) {
                throw new Error('File size cannot exceed 1MB');
            }

            // 오디오 파일 형식 체크
            if (!file.type.startsWith('audio/')) {
                throw new Error('Only audio files are allowed');
            }

            const base64Sound = await this.fileToBase64(file);
            const { customSounds = [] } = await chrome.storage.local.get('customSounds');
            
            // 고유 ID의 커스텀 사운드 생성
            const newSound = {
                value: 'custom_' + Date.now(),
                name: file.name.replace(/\.[^/.]+$/, ""),
                filename: file.name,
                data: base64Sound
            };

            customSounds.push(newSound);
            await chrome.storage.local.set({ customSounds });

            // UI 갱신 및 새로운 사운드 기본 선택
            await this.createSoundOptionsUI(newSound.value);
            return newSound;
        } catch (error) {
            console.error('커스텀 사운드 처리 실패:', error);
            alert(error.message);
            throw error;
        }
    },

    // 커스텀 사운드 삭제
    deleteCustomSound: async function(soundId) {
        try {
            const { customSounds = [] } = await chrome.storage.local.get('customSounds');
            const updatedSounds = customSounds.filter(sound => sound.value !== soundId);
            await chrome.storage.local.set({ customSounds: updatedSounds });
            
            // 현재 선택 사운드가 삭제된 경우 기본 사운드로 돌아감
            const { selectedSound } = await chrome.storage.local.get('selectedSound');
            const newSelectedSound = (selectedSound === soundId) ? 'chime1' : selectedSound;
            await Settings.save({ selectedSound: newSelectedSound });
            
            await this.createSoundOptionsUI(newSelectedSound);
        } catch (error) {
            console.error('커스텀 사운드 삭제 실패:', error);
            alert('Failed to delete custom sound');
        }
    },

    // 파일을 Base64로 변환
    fileToBase64: function(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
};

// ----------------------------- AudioController (팝업 사운드 테스트 전용) -----------------------------
// [역할] 사용자가 팝업에서 사운드를 선택하거나 볼륨을 변경할 때 테스트 재생을 담당.
//       커스텀 사운드의 경우 base64 -> Blob 변환 처리.
const AudioController = {
    audioElement: new Audio(),
    blobUrl: null,

    // sounds.json에서 특정 사운드 정보 가져오기 (기본 사운드용)
    async getSoundInfo(soundName) {
        try {
            const response = await fetch(chrome.runtime.getURL('sounds/sounds.json'));
            const data = await response.json();
            return data.sounds.find(sound => sound.value === soundName);
        } catch (error) {
            console.error('sounds.json 로드 실패:', error);
            return null;
        }
    },
    
    // 선택된 사운드 테스트 재생
    playTestSound: async function(soundName, volume) {
        try {
            // 이전 Blob URL 정리
            if (this.blobUrl) {
                URL.revokeObjectURL(this.blobUrl);
                this.blobUrl = null;
            }
            
            let soundUrl;
            
            // 커스텀 사운드 처리
            if (soundName.startsWith('custom_')) {
                const { customSounds = [] } = await chrome.storage.local.get('customSounds');
                const customSound = customSounds.find(sound => sound.value === soundName);
                if (!customSound) {
                    throw new Error('Custom sound not found.');
                }

                // Base64 -> Blob 변환
                const [header, base64Data] = customSound.data.split(',');
                if (!base64Data) {
                    throw new Error('Invalid audio data.');
                }
                const mimeMatch = header.match(/^data:(.*?);base64$/);
                const mimeType = mimeMatch ? mimeMatch[1] : 'audio/mpeg';
                const byteCharacters = atob(base64Data);
                const byteNumbers = new Array(byteCharacters.length);
                
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: mimeType });
                
                this.blobUrl = URL.createObjectURL(blob);
                soundUrl = this.blobUrl;
            } else {
                // 기본 사운드
                const soundInfo = await this.getSoundInfo(soundName);
                if (!soundInfo) {
                    throw new Error(`Sound information not found: ${soundName}`);
                }
                soundUrl = chrome.runtime.getURL(`sounds/${soundInfo.filename}`);
            }
            
            this.audioElement.src = soundUrl;
            this.audioElement.volume = volume / 100;
            await this.audioElement.play();
        } catch (error) {
            console.error('사운드 재생 오류:', error);
            alert('An error occurred while playing the sound.');
        } finally {
            // 재생 후에는 blobUrl 해제 (커스텀 사운드 시)
            if (this.blobUrl) {
                URL.revokeObjectURL(this.blobUrl);
                this.blobUrl = null;
            }
        }
    },
    
    // 리소스 정리
    cleanup: function() {
        if (this.blobUrl) {
            URL.revokeObjectURL(this.blobUrl);
            this.blobUrl = null;
        }
    }
};

// ----------------------------- UIController (UI 제어) -----------------------------
// [역할] UI 요소 초기화, 이벤트 리스너 등록, 설정값으로부터 UI 업데이트 등을 담당.
//       화면 요소와 직접적으로 상호작용하는 로직은 여기서 관리.
const UIController = {
    elements: {
        timerToggle: $('#timerToggle'),
        intervalSelect: $('#intervalSelect'),
        volumeSlider: $('#volumeSlider'),
        volumeValue: $('#volumeValue'),
        nextChimeTime: $('#nextChimeTime'),
        sections: $('.container .section').not(':first') // 첫 번째 섹션 제외
    },
    
    // UI 초기화 (팝업이 열릴 때 실행)
    init: async function() {
        const settings = await Settings.load();

        // 타이머 모드 설정 반영
        $(`input[name="timerMode"][value="${settings.timerMode}"]`).prop('checked', true);
        this.toggleTimerMode(settings.timerMode);

        // 단일 모드: 기존 사운드 옵션 UI 생성
        if (settings.timerMode === 'single') {
            await SoundManager.createSoundOptionsUI(settings.selectedSound);
        }
        // 듀얼 모드: 듀얼 타이머 사운드 옵션 생성
        else {
            await DualTimerManager.populateSoundSelects();
            // 듀얼 타이머 설정 복원
            $('#shortIntervalSelect').val(settings.dualTimer.shortInterval);
            $('#longIntervalSelect').val(settings.dualTimer.longInterval);
            $('#shortTimerSound').val(settings.dualTimer.shortSound);
            $('#longTimerSound').val(settings.dualTimer.longSound);
            
            // 듀얼 타이머 유효성 검사
            const validation = DualTimerManager.validateIntervals(
                settings.dualTimer.shortInterval,
                settings.dualTimer.longInterval
            );
            DualTimerManager.updateValidationStatus(validation);
        }

        // 기본 UI 설정
        this.elements.timerToggle.prop('checked', settings.isActive);
        this.elements.intervalSelect.val(settings.interval);
        this.elements.volumeSlider.val(settings.volume);
        this.elements.volumeValue.text(settings.volume + '%');

        this.updateSectionsState(settings.isActive);
        
        // 모드에 따른 다음 알람 시간 표시
        if (settings.timerMode === 'single') {
            this.updateNextChimeTimeDisplay(settings.interval);
        } else if (settings.timerMode === 'dual' && settings.dualTimer) {
            this.updateDualTimerNextChimeDisplay(
                settings.dualTimer.shortInterval,
                settings.dualTimer.longInterval
            );
        }

        // 이벤트 리스너 설정
        this.setupEventListeners();
    },
    
    // 섹션 활성/비활성화 표시
    updateSectionsState: function(isActive) {
        this.elements.sections.toggleClass('disabled', !isActive);
        $('.next-chime-container').toggleClass('disabled', !isActive);
    },
    
    // 타이머 모드 전환
    toggleTimerMode: function(mode) {
        if (mode === 'single') {
            $('#singleSoundSection').show();
            $('#singleTimerSection').show();
            $('#dualTimerSection').hide();
        } else {
            $('#singleSoundSection').hide();
            $('#singleTimerSection').hide();
            $('#dualTimerSection').show();
        }
    },

    // 다음 알람 시간 표시 업데이트 (단일 모드)
    updateNextChimeTimeDisplay: function(interval) {
        const specificTimeValue = $('#specificTimeInput').val();
        const customIntervalValue = $('#customIntervalInput').val();
        const nextTimeString = calculateNextChimeTimeString(
            interval,
            specificTimeValue,
            customIntervalValue
        );
        if (nextTimeString) {
            this.elements.nextChimeTime.text(nextTimeString);
        }
    },
    
    // 듀얼 타이머용 다음 알람 시간 표시 업데이트
    updateDualTimerNextChimeDisplay: function(shortInterval, longInterval) {
        const nextTimeString = calculateDualTimerNextChimeTime(shortInterval, longInterval);
        if (nextTimeString) {
            this.elements.nextChimeTime.text(nextTimeString);
        }
    },
    
    // 이벤트 리스너 설정
    setupEventListeners: function() {
        // 타이머 ON/OFF
        this.elements.timerToggle.on('change', async function() {
            const isActive = $(this).prop('checked');
            await Settings.save({ isActive });
            chrome.runtime.sendMessage({ type: 'toggleTimer', isActive });
            UIController.updateSectionsState(isActive);
        });

        // 사운드 선택 (라디오 버튼 변경)
        $('#soundOptions').on('change', 'input[name="sound"]', async function() {
            const selectedSound = $(this).val();
            await Settings.save({ selectedSound });
            AudioController.playTestSound(selectedSound, UIController.elements.volumeSlider.val());
        });

        // 인터벌 선택 변경
        this.elements.intervalSelect.on('change', async function() {
            const interval = $(this).val();
            await Settings.save({ interval });
            UIController.updateNextChimeTimeDisplay(interval);
            chrome.runtime.sendMessage({ type: 'updateInterval', interval });
        });

        // 볼륨 슬라이더 변경
        this.elements.volumeSlider.on('input', function() {
            const volume = parseInt($(this).val());
            UIController.elements.volumeValue.text(volume + '%');
        });
        
        this.elements.volumeSlider.on('change', async function() {
            const volume = parseInt($(this).val());
            await Settings.save({ volume });
            const selectedSound = $('input[name="sound"]:checked').val();
            AudioController.playTestSound(selectedSound, volume);
        });

        // 커스텀 사운드 업로드
        $('#customSoundInput').on('change', async function(e) {
            const file = e.target.files[0];
            if (file) {
                try {
                    const customSound = await SoundManager.handleCustomSound(file);
                    await Settings.save({ selectedSound: customSound.value });
                    AudioController.playTestSound(customSound.value, UIController.elements.volumeSlider.val());
                } catch (error) {
                    // 에러 발생 시 파일 입력 초기화
                    this.value = '';
                }
            }
        });
        
        // ---- 듀얼 타이머 관련 이벤트 리스너 ----
        
        // 타이머 모드 전환
        $('input[name="timerMode"]').on('change', async function() {
            const mode = $(this).val();
            UIController.toggleTimerMode(mode);
            
            // 모드에 따른 초기화
            if (mode === 'single') {
                const settings = await Settings.load();
                await SoundManager.createSoundOptionsUI(settings.selectedSound);
                await Settings.save({ timerMode: 'single' });

                if (settings.isActive) {
                    chrome.runtime.sendMessage({
                        action: 'updateAlarm',
                        interval: settings.interval,
                        customInterval: settings.customInterval,
                        specificTime: settings.specificTime,
                        repeatDaily: settings.repeatDaily
                    });
                }

                UIController.updateNextChimeTimeDisplay($('#intervalSelect').val());
            } else {
                // 듀얼 사운드 선택 옵션 생성
                await DualTimerManager.populateSoundSelects();
                
                // 저장된 듀얼 타이머 설정 불러오기
                const currentSettings = await Settings.load();
                if (currentSettings.dualTimer) {
                    // 저장된 설정이 있으면 UI에 복원
                    $('#shortIntervalSelect').val(currentSettings.dualTimer.shortInterval);
                    $('#longIntervalSelect').val(currentSettings.dualTimer.longInterval);
                    $('#shortTimerSound').val(currentSettings.dualTimer.shortSound);
                    $('#longTimerSound').val(currentSettings.dualTimer.longSound);
                }
                
                await Settings.save({ timerMode: 'dual' });
                
                // 현재 UI 값으로 듀얼 타이머 설정 저장/검증
                await DualTimerManager.saveDualTimerSettings();
                
                // 다음 알람 시간 업데이트
                const shortInterval = $('#shortIntervalSelect').val();
                const longInterval = $('#longIntervalSelect').val();
                UIController.updateDualTimerNextChimeDisplay(shortInterval, longInterval);
            }
        });
        
        // 듀얼 타이머 짧은 주기 변경
        $('#shortIntervalSelect').on('change', async function() {
            await DualTimerManager.saveDualTimerSettings();
            // 다음 알람 시간 업데이트
            const shortInterval = $('#shortIntervalSelect').val();
            const longInterval = $('#longIntervalSelect').val();
            UIController.updateDualTimerNextChimeDisplay(shortInterval, longInterval);
        });
        
        // 듀얼 타이머 긴 주기 변경
        $('#longIntervalSelect').on('change', async function() {
            await DualTimerManager.saveDualTimerSettings();
            // 다음 알람 시간 업데이트
            const shortInterval = $('#shortIntervalSelect').val();
            const longInterval = $('#longIntervalSelect').val();
            UIController.updateDualTimerNextChimeDisplay(shortInterval, longInterval);
        });
        
        // 듀얼 타이머 사운드 변경
        $('#shortTimerSound, #longTimerSound').on('change', async function() {
            await DualTimerManager.saveDualTimerSettings();
            // 단일 사운드 테스트 재생
            const soundValue = $(this).val();
            AudioController.playTestSound(soundValue, UIController.elements.volumeSlider.val());
        });
    }
};

// ----------------------------- 팝업 초기 로딩 처리 -----------------------------
$(document).ready(() => {
    UIController.init();
});

// 팝업 닫힐 때 오디오 리소스 정리
window.addEventListener('unload', () => {
    AudioController.cleanup();
});


// ----------------------------- 추가 설정 로직 (인터벌/특정시각 UI) -----------------------------
// [설명] 아래 로직은 특정 시간, 커스텀 인터벌을 설정하는 추가 UI를 처리.
//        별도 블록으로 분리하여 UIController와 구분함. (단, 더 모듈화도 가능)
$(document).ready(async () => {
    const $intervalSelect = $('#intervalSelect');
    const $customIntervalContainer = $('#customIntervalContainer');
    const $specificTimeContainer = $('#specificTimeContainer');
    const $customIntervalInput = $('#customIntervalInput');
    const $specificTimeInput = $('#specificTimeInput');
    const $repeatDailyCheckbox = $('#repeatDaily');
    const $nextChimeTime = $('#nextChimeTime');

    const settings = await chrome.storage.local.get(['interval', 'customInterval', 'specificTime', 'repeatDaily']);

    // 인터벌 UI 초기상태 복원
    if (settings.interval) {
        $intervalSelect.val(settings.interval);
        $customIntervalContainer.toggle(settings.interval === 'custom');
        $specificTimeContainer.toggle(settings.interval === 'specific');
    }

    if (settings.interval === 'custom' && settings.customInterval) {
        $customIntervalInput.val(settings.customInterval);
    }

    if (settings.interval === 'specific' && settings.specificTime) {
        $specificTimeInput.val(settings.specificTime);
        $repeatDailyCheckbox.prop('checked', settings.repeatDaily !== false);
    }

    updateNextChimeTimeDisplay();

    // 이벤트 리스너 설정
    $intervalSelect.on('change', async () => {
        const selectedValue = $intervalSelect.val();
        $customIntervalContainer.toggle(selectedValue === 'custom');
        $specificTimeContainer.toggle(selectedValue === 'specific');

        if (selectedValue === 'custom') {
            $customIntervalInput.val(settings.customInterval || 15);
        } else if (selectedValue === 'specific') {
            $specificTimeInput.val(settings.specificTime || '');
            $repeatDailyCheckbox.prop('checked', settings.repeatDaily !== false);
        }

        await saveUserIntervalSettings();
        updateNextChimeTimeDisplay();
    });

    $customIntervalInput.on('input', debounce(async () => {
        await saveUserIntervalSettings();
        updateNextChimeTimeDisplay();
    }, 300));

    $customIntervalInput.on('blur', async () => {
        await saveUserIntervalSettings();
        updateNextChimeTimeDisplay();
    });

    $specificTimeInput.on('change', async () => {
        await saveUserIntervalSettings();
        updateNextChimeTimeDisplay();
    });

    $repeatDailyCheckbox.on('change', async () => {
        await saveUserIntervalSettings();
        updateNextChimeTimeDisplay();
    });

    $(window).on('beforeunload', async () => {
        await saveUserIntervalSettings();
        updateNextChimeTimeDisplay();
    });

    // chrome.runtime 메시지 리스너: 백그라운드에서 알람 시간이 업데이트되면 UI 갱신
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'updateNextChimeTime') {
            const nextTime = new Date(message.nextChimeTime);
            const timeString = nextTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            $('#nextChimeTime').text(timeString);
        }
    });

    // ---------- 유틸리티 함수들 ----------
    // [debounce 함수]
    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // [설정 저장 함수]
    async function saveUserIntervalSettings() {
        const previousSettings = await chrome.storage.local.get(['interval', 'customInterval', 'specificTime', 'repeatDaily']);
        const newSettings = {
            ...previousSettings,
            interval: $intervalSelect.val(),
        };

        if ($intervalSelect.val() === 'custom') {
            const customIntervalValue = parseInt($customIntervalInput.val()) || 15;
            newSettings.customInterval = customIntervalValue;
        }

        if ($intervalSelect.val() === 'specific') {
            const specificTimeValue = $specificTimeInput.val();
            const repeatDailyValue = $repeatDailyCheckbox.prop('checked');
            newSettings.specificTime = specificTimeValue;
            newSettings.repeatDaily = repeatDailyValue;
        }

        await chrome.storage.local.set(newSettings);
        await updateAlarmToBackground(newSettings);
    }

    // [다음 알림 시간 UI 갱신 함수]
    function updateNextChimeTimeDisplay() {
        const intervalValue = $intervalSelect.val();
        const timeString = calculateNextChimeTimeString(intervalValue, $specificTimeInput.val(), $customIntervalInput.val());
        if (timeString) {
            $nextChimeTime.text(timeString);
        }
    }

    // [백그라운드 스크립트에 알람 업데이트 요청]
    async function updateAlarmToBackground(settings) {
        await chrome.runtime.sendMessage({ 
            action: 'updateAlarm',
            interval: settings.interval,
            customInterval: parseInt($customIntervalInput.val()),
            specificTime: $specificTimeInput.val(),
            repeatDaily: $repeatDailyCheckbox.prop('checked')
        });
    }
});

// ---------- 공용 유틸 함수: 다음 알림 시간 계산 ----------
// [역할] 주어진 interval값(또는 specificTime, customInterval)을 기반으로 다음 알림 시간을 계산해 문자열로 반환.
//        popup.js 내에서 UIController, 추가 설정 로직 모두 재사용.
function calculateNextChimeTimeString(interval, specificTimeValue, customIntervalValue) {
    const now = new Date();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    let nextTime = null;

    if (!interval) return '--:--';

    if (interval === 'specific' && specificTimeValue) {
        const [hours, mins] = specificTimeValue.split(':').map(Number);
        nextTime = new Date(now);
        nextTime.setHours(hours, mins, 0, 0);
        
        if (nextTime <= now) {
            nextTime.setDate(nextTime.getDate() + 1);
        }
    } else if (interval === 'custom') {
        const customInterval = Math.max(1, parseInt(customIntervalValue) || 15);
        const nextMinutes = Math.ceil(minutes / customInterval) * customInterval;
        let delayMinutesExact = nextMinutes - minutes - (seconds / 60);
        if (delayMinutesExact <= 0) {
            delayMinutesExact += customInterval;
        }

        nextTime = new Date(now.getTime() + delayMinutesExact * 60000);
        nextTime.setSeconds(0, 0);
    } else {
        const intervalMinutes = Math.max(1, parseInt(interval) || 15);
        const nextMinutes = Math.ceil(minutes / intervalMinutes) * intervalMinutes;
        let delayMinutesExact = nextMinutes - minutes - (seconds / 60);
        if (delayMinutesExact <= 0) {
            delayMinutesExact += intervalMinutes;
        }

        nextTime = new Date(now.getTime() + delayMinutesExact * 60000);
        nextTime.setSeconds(0, 0);
    }

    if (!nextTime) return '--:--';
    return nextTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ---------- 듀얼 타이머용 다음 알람 시간 계산 ----------
// [역할] 두 개의 다른 주기를 가진 타이머에서 다음에 울릴 가장 빠른 알람을 계산
function calculateDualTimerNextChimeTime(shortInterval, longInterval) {
    const now = new Date();
    const currentMinutes = now.getMinutes();
    const currentSeconds = now.getSeconds();
    
    const short = parseInt(shortInterval);
    const long = parseInt(longInterval);
    
    // 짧은 주기 다음 알람 시간 계산
    const shortNextMinutes = Math.ceil(currentMinutes / short) * short;
    let shortDelayExact = shortNextMinutes - currentMinutes - (currentSeconds / 60);
    if (shortDelayExact <= 0) {
        shortDelayExact += short;
    }
    const shortNextTime = new Date(now.getTime() + shortDelayExact * 60000);
    shortNextTime.setSeconds(0, 0);
    
    // 긴 주기 다음 알람 시간 계산
    const longNextMinutes = Math.ceil(currentMinutes / long) * long;
    let longDelayExact = longNextMinutes - currentMinutes - (currentSeconds / 60);
    if (longDelayExact <= 0) {
        longDelayExact += long;
    }
    const longNextTime = new Date(now.getTime() + longDelayExact * 60000);
    longNextTime.setSeconds(0, 0);
    
    // 두 시간 중 더 빠른 시간 선택
    const nextTime = shortNextTime <= longNextTime ? shortNextTime : longNextTime;
    
    // 겹치는 시간인지 확인해서 정보 추가
    const nextMinutes = nextTime.getMinutes();
    const isOverlapTime = (nextMinutes % long === 0);
    const soundType = isOverlapTime ? 'Timer 2' : (nextTime.getTime() === shortNextTime.getTime() ? 'Timer 1' : 'Timer 2');
    
    const timeString = nextTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${timeString} (${soundType})`;
}
