// 설정값을 저장하고 로드하는 함수들
const Settings = {
    // 설정 저장
    save: async function(settings) {
        await chrome.storage.local.set(settings);
        // 사운드 관련 설정이 변경되면 background script에 알림
        if (settings.selectedSound !== undefined || settings.volume !== undefined) {
            chrome.runtime.sendMessage({ type: 'updateSound' });
        }
    },
    
    // 설정 로드
    load: async function() {
        return chrome.storage.local.get({
            isActive: false,
            selectedSound: 'chime1',
            interval: 15,
            volume: 50,
            customInterval: 15,
            specificTime: '',
            repeatDaily: false
        });
    }
};

// 사운드 관리자
const SoundManager = {
    // 사운드 파일 목록 가져오기
    getSoundFiles: async function() {
        try {
            const response = await fetch(chrome.runtime.getURL('sounds/sounds.json'));
            const data = await response.json();
            
            // 저장된 커스텀 사운드 목록 가져오기
            const { customSounds = [] } = await chrome.storage.local.get('customSounds');
            
            // 기본 사운드와 커스텀 사운드 합치기
            return [...data.sounds, ...customSounds];
        } catch (error) {
            console.error('Failed to load sound files:', error);
            return [];
        }
    },

    // 사운드 옵션 UI 생성
    createSoundOptions: async function(selectedSound) {
        const sounds = await this.getSoundFiles();
        const container = $('#soundOptions');
        container.empty();

        // 첫 번째 사운드를 기본값으로 설정
        if (!selectedSound && sounds.length > 0) {
            selectedSound = sounds[0].value;
            await Settings.save({ selectedSound });
        }

        sounds.forEach(sound => {
            const label = $('<label>');
            const input = $('<input>', {
                type: 'radio',
                name: 'sound',
                value: sound.value,
                checked: sound.value === selectedSound
            });
            
            label.append(input);
            label.append(sound.name);
            
            // 커스텀 사운드인 경우 삭제 버튼 추가
            if (sound.value.startsWith('custom_')) {
                const deleteBtn = $('<button>', {
                    class: 'delete-btn sound-delete-btn',
                    html: '&times;',
                    title: 'Delete sound'
                }).on('click', (e) => {
                    e.preventDefault(); // 라디오 버튼 선택 방지
                    this.deleteCustomSound(sound.value);
                });
                
                label.append(deleteBtn);
            }
            
            container.append(label);
        });

        return sounds;
    },

    // 커스텀 사운드 처리
    handleCustomSound: async function(file) {
        try {
            // 파일 크기 체크 (1MB 제한)
            if (file.size > 1024 * 1024) {
                throw new Error('File size cannot exceed 1MB');
            }

            // 지원되는 파일 형식 체크
            if (!file.type.startsWith('audio/')) {
                throw new Error('Only audio files are allowed');
            }

            // 파일을 Base64로 변환
            const base64Sound = await this.fileToBase64(file);
            
            // 현재 저장된 커스텀 사운드 목록 가져오기
            const { customSounds = [] } = await chrome.storage.local.get('customSounds');
            
            // 새로운 커스텀 사운드 생성
            const newSound = {
                value: 'custom_' + Date.now(), // 고유 ID 생성
                name: file.name.replace(/\.[^/.]+$/, ""), // 확장자 제거
                filename: file.name,
                data: base64Sound
            };

            // 커스텀 사운드 목록에 추가
            customSounds.push(newSound);

            // storage에 저장
            await chrome.storage.local.set({ customSounds });

            // 사운드 옵션 UI 업데이트
            await this.createSoundOptions(newSound.value);
            
            return newSound;
        } catch (error) {
            console.error('Failed to process custom sound:', error);
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
            
            // 현재 선택된 사운드가 삭제되는 경우 기본 사운드로 변경
            const { selectedSound } = await chrome.storage.local.get('selectedSound');
            if (selectedSound === soundId) {
                await Settings.save({ selectedSound: 'chime1' });
            }
            
            // UI 업데이트
            await this.createSoundOptions(selectedSound === soundId ? 'chime1' : selectedSound);
        } catch (error) {
            console.error('Failed to delete custom sound:', error);
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

// 오디오 컨트롤러
const AudioController = {
    audio: new Audio(),
    blobUrl: null,
    
    // sounds.json에서 사운드 정보 가져오기
    async getSoundInfoFromJson(soundName) {
        try {
            // 기본 사운드인 경우
            const response = await fetch(chrome.runtime.getURL('sounds/sounds.json'));
            const data = await response.json();
            return data.sounds.find(sound => sound.value === soundName);
        } catch (error) {
            console.error('Error loading sounds.json:', error);
            return null;
        }
    },
    
    // 사운드 테스트
    playTest: async function(soundName, volume) {
        try {
            let soundUrl;
            
            // 커스텀 사운드인 경우 storage에서 base64 데이터 가져오기
            if (soundName.startsWith('custom_')) {
                const { customSounds = [] } = await chrome.storage.local.get('customSounds');
                const customSound = customSounds.find(sound => sound.value === soundName);
                if (!customSound) {
                    throw new Error('커스텀 사운드를 찾을 수 없습니다.');
                }
                
                // 기존 Blob URL 해제
                if (this.blobUrl) {
                    URL.revokeObjectURL(this.blobUrl);
                }
                
                // Base64 데이터를 Blob으로 변환
                const base64Data = customSound.data.split(',')[1];
                const byteCharacters = atob(base64Data);
                const byteNumbers = new Array(byteCharacters.length);
                
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'audio/mpeg' });
                
                // Blob URL 생성
                this.blobUrl = URL.createObjectURL(blob);
                soundUrl = this.blobUrl;

            } else {

            // 기본 사운드인 경우 sounds.json에서 정보 가져오기
                const soundInfo = await this.getSoundInfoFromJson(soundName);
                if (!soundInfo) {
                    throw new Error(`Sound info not found for: ${soundName}`);
                }
                soundUrl = chrome.runtime.getURL(`sounds/${soundInfo.filename}`);
            }
            
            const volumeValue = volume / 100;
            this.audio.src = soundUrl;
            this.audio.volume = volumeValue;
            await this.audio.play();
            
        } catch (error) {
            console.error('Error playing test sound:', error);
            alert('사운드 재생 중 오류가 발생했습니다.');
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

// UI 컨트롤러
const UIController = {
    // UI 요소들
    elements: {
        timerToggle: $('#timerToggle'),
        soundOptions: $('input[name="sound"]'),
        intervalSelect: $('#intervalSelect'),
        volumeSlider: $('#volumeSlider'),
        volumeValue: $('#volumeValue'),
        nextChimeTime: $('#nextChimeTime'),
        sections: $('.container .section').not(':first') // 첫 번째 섹션(토글)을 제외한 모든 섹션
    },
    
    // UI 초기화
    init: async function() {
        const settings = await Settings.load();
        
        // 사운드 옵션 동적 생성
        await SoundManager.createSoundOptions(settings.selectedSound);
        
        // 설정값으로 UI 업데이트
        this.elements.timerToggle.prop('checked', settings.isActive);
        this.elements.intervalSelect.val(settings.interval);
        this.elements.volumeSlider.val(settings.volume);
        this.elements.volumeValue.text(settings.volume + '%');
        
        // 섹션 활성화/비활성화 상태 정
        this.updateSectionsState(settings.isActive);
        
        // 다음 알림 시간 업데이트
        this.updateNextChimeTime(settings.interval);
        
        // 이벤트 리스너 설정
        this.setupEventListeners();
    },
    
    // 섹션 활성화/비활성화 상태 업데이트
    updateSectionsState: function(isActive) {
        this.elements.sections.toggleClass('disabled', !isActive);
        $('.next-chime-container').toggleClass('disabled', !isActive);
    },
    
    // 이벤트 리스너 설정
    setupEventListeners: function() {
        // 타이머 토글
        this.elements.timerToggle.on('change', async function() {
            const isActive = $(this).prop('checked');
            await Settings.save({ isActive });
            chrome.runtime.sendMessage({ type: 'toggleTimer', isActive });
            UIController.updateSectionsState(isActive);
        });
        
        // 사운드 선택 (동적으로 생성된 요소에 대한 이벤트 위임)
        $('#soundOptions').on('change', 'input[name="sound"]', async function() {
            const selectedSound = $(this).val();
            await Settings.save({ selectedSound });
            AudioController.playTest(selectedSound, UIController.elements.volumeSlider.val());
        });
        
        // 간격 선택
        this.elements.intervalSelect.on('change', async function() {
            const interval = $(this).val();
            await Settings.save({ interval });
            UIController.updateNextChimeTime(interval);
            chrome.runtime.sendMessage({ type: 'updateInterval', interval });
        });
        
        // 볼륨 조절
        this.elements.volumeSlider.on('input', function() {
            const volume = parseInt($(this).val());
            UIController.elements.volumeValue.text(volume + '%');
        });
        
        this.elements.volumeSlider.on('change', async function() {
            const volume = parseInt($(this).val());
            await Settings.save({ volume });
            const selectedSound = $('input[name="sound"]:checked').val();
            AudioController.playTest(selectedSound, volume);
        });

        // 커스텀 사운드 파일 업로드 처리
        $('#customSoundInput').on('change', async function(e) {
            const file = e.target.files[0];
            if (file) {
                try {
                    const customSound = await SoundManager.handleCustomSound(file);
                    // 업로드 성공 시 해당 사운드로 변경하고 테스트 재생
                    await Settings.save({ selectedSound: customSound.value });
                    AudioController.playTest(customSound.value, UIController.elements.volumeSlider.val());
                } catch (error) {
                    // 에러 처리는 handleCustomSound 내에서 수행
                    this.value = ''; // 파일 입력 초기화
                }
            }
        });
    },
    
    // 다음 알림 시간 업데이트
    updateNextChimeTime: function(interval) {
        const nextChimeElement = document.getElementById('nextChimeTime');
        if (!nextChimeElement) return;

        let nextTime;
        const now = new Date();

        if (interval === 'specific') {
            const [hours, minutes] = document.getElementById('specificTimeInput').value.split(':').map(Number);
            nextTime = new Date(now);
            nextTime.setHours(hours, minutes, 0, 0);
            
            if (nextTime <= now) {
                nextTime.setDate(nextTime.getDate() + 1);
            }
        } else if (interval === 'custom') {
            const customInterval = parseInt(document.getElementById('customIntervalInput').value) || 15;
            const minutesToAdd = customInterval - (now.getMinutes() % customInterval);
            nextTime = new Date(now.getTime() + minutesToAdd * 60000);
            nextTime.setSeconds(0, 0);
        } else {
            const minutesToAdd = interval - (now.getMinutes() % interval);
            nextTime = new Date(now.getTime() + minutesToAdd * 60000);
            nextTime.setSeconds(0, 0);
        }

        nextChimeElement.textContent = nextTime.toLocaleTimeString();
    }
};

// 팝업 초기화
$(document).ready(() => {
    UIController.init();
});

// 팝업 창이 닫힐 때 리소스 정리
window.addEventListener('unload', () => {
    AudioController.cleanup();
});

$(document).ready(async () => {
    const $intervalSelect = $('#intervalSelect');
    const $customIntervalContainer = $('#customIntervalContainer');
    const $specificTimeContainer = $('#specificTimeContainer');
    const $customIntervalInput = $('#customIntervalInput');
    const $specificTimeInput = $('#specificTimeInput');
    const $repeatDailyCheckbox = $('#repeatDaily');
    const $nextChimeTime = $('#nextChimeTime');

    // 설정 로드
    const settings = await chrome.storage.local.get(['interval', 'customInterval', 'specificTime', 'repeatDaily']);
    /* settings 의 값들 예시 : 
        customInterval - 2, 42, .. 사용자가 입력한 커스텀 인터벌 시간
        interval - 15, 30, 60, 'custom', 'specific' (선택상자의 옵션 value)
        isActive - false, true
        repeatDaily - false, true
        selectedSound - 'chime1', 'chime2', 'custom_1343'
        specificTime - "13:32"
    */

    // 선택상자 값 적용
    if (settings.interval) {
        $intervalSelect.val(settings.interval);
        $customIntervalContainer.toggle(settings.interval === 'custom');
        $specificTimeContainer.toggle(settings.interval === 'specific');
    }

    // 커스텀 인터벌이면 값 복구
    if (settings.interval === 'custom' && settings.customInterval) {
        $customIntervalInput.val(settings.customInterval);
    }

    // 특정 시각이면 값 복구
    if (settings.interval === 'specific' && settings.specificTime) {
        $specificTimeInput.val(settings.specificTime);
        $repeatDailyCheckbox.prop('checked', settings.repeatDaily !== false);
    }

    // 다음 알림 시간 표시 업데이트
    updateNextChimeTime();

    /*********************** 이벤트 리스터 설정 ************************/
    // 시간 간격 선택창 변경 이벤트
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

        await saveSettings();
        updateNextChimeTime();
    });

    // 커스텀 인터벌 입력 이벤트
    $customIntervalInput.on('input', debounce(async () => {
        await saveSettings();
        updateNextChimeTime();
    }, 300));

    // 포커스 아웃 이벤트
    $customIntervalInput.on('blur', async () => {
        await saveSettings();
        updateNextChimeTime();
    });

    // 특정 시각 알람 입력 이벤트
    $specificTimeInput.on('change', async () => {
        await saveSettings();
        updateNextChimeTime();
    });

    // 특정 시각 입력 시 매일 반복 체크박스 이벤트
    $repeatDailyCheckbox.on('change', async () => {
        await saveSettings();
        updateNextChimeTime();
    });

    // 팝업 닫힐 때 이벤트
    $(window).on('beforeunload', async () => {
        await saveSettings();
        updateNextChimeTime();
    });
    /*********************** 이벤트 리스터 설정 ************************/

    // debounce 함수 정의
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    async function saveSettings() {
        // 기존 저장된 설정 불러오기
        const previousSettings = await chrome.storage.local.get(['interval', 'customInterval', 'specificTime', 'repeatDaily']);

        // 현재 값으로 기존 설정 업데이트
        const settings = {
            ...previousSettings, // 기존 값 유지
            interval: $intervalSelect.val(), // 현재 선택된 선택상자 옵션값
        };

        // 커스텀 인터벌 선택돼있으면 값 업데이트
        if ($intervalSelect.val() === 'custom') {
            const customInterval = parseInt($customIntervalInput.val()) || 15;
            if (settings.customInterval !== customInterval) {
                settings.customInterval = customInterval; // 변경된 경우만 업데이트
            }
        }

        // 특정 시각 선택돼있으면 값 업데이트
        if ($intervalSelect.val() === 'specific') {
            const specificTime = $specificTimeInput.val();
            const repeatDaily = $repeatDailyCheckbox.prop('checked');

            if (settings.specificTime !== specificTime) {
                settings.specificTime = specificTime; // 변경된 경우만 업데이트
            }

            if (settings.repeatDaily !== repeatDaily) {
                settings.repeatDaily = repeatDaily; // 변경된 경우만 업데이트
            }
        }


        // 설정 저장
        await chrome.storage.local.set(settings);
        await updateAlarm();    // 알람 업데이트 호출
    }

    // 'Next chime at: ' 에 보여질 다음 알림 시간 업데이트
    function updateNextChimeTime() {
        if (!$nextChimeTime.length) return;

        let nextTime;
        const now = new Date();

        // 특정 시간 select box 에서 선택돼있으면
        if ($intervalSelect.val() === 'specific') {
            const [hours, minutes] = $specificTimeInput.val().split(':').map(Number);
            nextTime = new Date(now);
            nextTime.setHours(hours, minutes, 0, 0);
            
            if (nextTime <= now) {
                nextTime.setDate(nextTime.getDate() + 1);
            }
        // 커스텀 인터벌 select box에서 선택돼있면
        } else if ($intervalSelect.val() === 'custom') {
            const customInterval = parseInt($customIntervalInput.val()) || 15;
            const minutesToAdd = customInterval - (now.getMinutes() % customInterval);
            nextTime = new Date(now.getTime() + minutesToAdd * 60000);
            nextTime.setSeconds(0, 0);
        // 일반 인터벌 select box에서 선택돼있면
        } else {
            const interval = parseInt($intervalSelect.val()) || 15;
            const minutesToAdd = interval - (now.getMinutes() % interval);
            nextTime = new Date(now.getTime() + minutesToAdd * 60000);
            nextTime.setSeconds(0, 0);
        }

        $nextChimeTime.text(nextTime.toLocaleTimeString());
    }

    async function updateAlarm() {
        await chrome.runtime.sendMessage({ 
            action: 'updateAlarm',
            interval: $intervalSelect.val(),
            customInterval: parseInt($customIntervalInput.val()),
            specificTime: $specificTimeInput.val(),
            repeatDaily: $repeatDailyCheckbox.prop('checked')
        });
    }

    // 초기 다음 알림 시간 표시
    updateNextChimeTime();
    
    // 다음 알람 시간 업데이트 메시지 리스너
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'updateNextChimeTime') {
            const nextChimeTimeSpan = document.getElementById('nextChimeTime');
            if (nextChimeTimeSpan) {
                const nextTime = new Date(message.nextChimeTime);
                nextChimeTimeSpan.textContent = nextTime.toLocaleTimeString();
            }
        }
    });
});