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
            volume: 50
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
            return data.sounds;
        } catch (error) {
            console.error('사운드 파일 로드 실패:', error);
            // 기본 사운드 목록 반환
            return [
                { value: 'chime1', name: 'Chime 1', filename: 'chime1.mp3' },
                { value: 'chime2', name: 'Chime 2', filename: 'chime2.mp3' },
                { value: 'chime3', name: 'Chime 3', filename: 'chime3.mp3' }
            ];
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
            container.append(label);
        });

        return sounds;
    }
};

// 오디오 컨트롤러
const AudioController = {
    audio: new Audio(),
    
    // sounds.json에서 사운드 정보 가져오기
    async getSoundInfo(soundName) {
        try {
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
            const soundInfo = await this.getSoundInfo(soundName);
            if (!soundInfo) {
                throw new Error(`Sound info not found for: ${soundName}`);
            }
            
            const volumeValue = volume / 100;
            const soundUrl = chrome.runtime.getURL(`sounds/${soundInfo.filename}`);
            
            this.audio.src = soundUrl;
            this.audio.volume = volumeValue;
            await this.audio.play();
            console.log('Test sound played successfully:', {
                soundName: soundInfo.value,
                filename: soundInfo.filename,
                volume: volumeValue
            });
        } catch (error) {
            console.error('Error playing test sound:', error);
        }
    }
};

// 메시지 리스너 추가
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'playChime') {
        AudioController.playChime();
    }
});

// UI 컨트롤러
const UIController = {
    // UI 요소들
    elements: {
        timerToggle: $('#timerToggle'),
        soundOptions: $('input[name="sound"]'),
        intervalSelect: $('#intervalSelect'),
        volumeSlider: $('#volumeSlider'),
        volumeValue: $('#volumeValue'),
        nextChimeTime: $('#nextChimeTime')
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
        
        // 다음 알림 시간 업데이트
        this.updateNextChimeTime(settings.interval);
        
        // 이벤트 리스너 설정
        this.setupEventListeners();
    },
    
    // 이벤트 리스너 설정
    setupEventListeners: function() {
        // 타이머 토글
        this.elements.timerToggle.on('change', async function() {
            const isActive = $(this).prop('checked');
            await Settings.save({ isActive });
            chrome.runtime.sendMessage({ type: 'toggleTimer', isActive });
        });
        
        // 사운드 선택 (동적으로 생성된 요소에 대한 이벤트 위임)
        $('#soundOptions').on('change', 'input[name="sound"]', async function() {
            const selectedSound = $(this).val();
            await Settings.save({ selectedSound });
            AudioController.playTest(selectedSound, UIController.elements.volumeSlider.val());
        });
        
        // 간격 선택
        this.elements.intervalSelect.on('change', async function() {
            const interval = parseInt($(this).val());
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
    },
    
    // 다음 알림 시간 업데이트
    updateNextChimeTime: function(interval) {
        const now = new Date();
        const minutes = now.getMinutes();
        const nextMinutes = Math.ceil(minutes / interval) * interval;
        const nextTime = new Date(now);
        
        if (nextMinutes === 60) {
            nextTime.setHours(nextTime.getHours() + 1);
            nextTime.setMinutes(0);
        } else {
            nextTime.setMinutes(nextMinutes);
        }
        nextTime.setSeconds(0);
        
        const timeString = nextTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        this.elements.nextChimeTime.text(timeString);
    }
};

// 팝업 초기화
$(document).ready(() => {
    UIController.init();
}); 