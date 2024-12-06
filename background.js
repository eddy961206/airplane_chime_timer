// 오디오 관리자
const AudioManager = {

    // offscreen 문서 생성
    async createOffscreenDocument() {
        if (await chrome.offscreen.hasDocument()) return;
        await chrome.offscreen.createDocument({
            url: 'audio-player.html',
            reasons: ['AUDIO_PLAYBACK'],
            justification: 'Playing alarm sound'
        });
    },

    // sounds.json에서 사운드 정보 가져오기
    async getSoundInfoFromJson(soundName) {
        try {
            const response = await fetch(chrome.runtime.getURL('sounds/sounds.json'));
            const data = await response.json(); // sound -> {value: 'chime1', name: 'Single Chime', filename: 'one-chime.mp3'}
            return data.sounds.find(sound => sound.value === soundName);
        } catch (error) {
            console.error('Error loading sounds.json:', error);
            return null;
        }
    },
    
    // 사운드 재생
    async playSound(soundName, volume) {    // soundName -> 'chime1' 또는 'custom_1733444501214'
        try {
            await this.createOffscreenDocument();
            
            let soundUrl;
            let filename;

            // 커스텀 사운드인 경우
            if (soundName.startsWith('custom')) {
                const { customSounds } = await chrome.storage.local.get('customSounds');
                const customSound = customSounds.find(sound => sound.value === soundName);
                if (!customSound) {
                    throw new Error('custom sound not found');
                }
                
                // Base64 데이터를 직접 전달
                soundUrl = customSound.data;  // Base64 데이터를 직접 사용
                filename = customSound.filename;
            } else {
                // 기본 사운드인 경우
                const soundInfo = await this.getSoundInfoFromJson(soundName);
                if (!soundInfo) {
                    throw new Error(`Sound info not found for: ${soundName}`);
                }
                soundUrl = chrome.runtime.getURL(`sounds/${soundInfo.filename}`);
                filename = soundInfo.filename;
            }
            
            // 오디오 재생 메시지 전송
            chrome.runtime.sendMessage({
                type: 'playSound',
                soundUrl: soundUrl, // 커스텀 사운드-> base64 데이터, 기본 사운드 -> URL
                filename: filename, //  "a320-chime-1.mp3"
                volume: volume,
                isCustomSound: soundName.startsWith('custom')
            });
            
            console.log('Sound playback initiated:', { soundName, volume });
            
        } catch (error) {
            console.error('Error playing sound:', error);
        }
    }

};

// 알람 관리자
const AlarmManager = {
    // 알람 생성 함수
    async createAlarm(settings) {
        const { interval, customInterval, specificTime, repeatDaily } = settings;
        
        // 기존 알람 제거
        await chrome.alarms.clearAll();
        
        const now = new Date();
        const minutes = now.getMinutes();
        const seconds = now.getSeconds();
        
        // 지정된 시각에 알람 생성
        if (interval === 'specific' && specificTime) {
            const [hours, minutes] = specificTime.split(':').map(Number);
            const when = new Date(now);
            when.setHours(hours, minutes, 0, 0);
            
            if (when <= now) {
                when.setDate(when.getDate() + 1);
            }
            
            await chrome.alarms.create('chimeAlarm', {
                when: when.getTime(),
                periodInMinutes: repeatDaily ? 24 * 60 : undefined
            });
        } else {
        // 일반 인터벌 또는 커스텀 인터벌
            let intervalMinutes;
            if (interval === 'custom') {
                intervalMinutes = parseInt(customInterval) || 15;
            } else {
                intervalMinutes = parseInt(interval) || 15;
            }

            // 다음 간격까지의 시간 계산
            const nextMinutes = Math.ceil(minutes / intervalMinutes) * intervalMinutes;
            let delayInMinutes = nextMinutes - minutes;
            // 초를 고려한 정확한 지연 시간 계산
            const delayMinutesExact = delayInMinutes - (seconds / 60);
            
            // 유효성 검사
            if (intervalMinutes < 1) intervalMinutes = 15;
            
            await chrome.alarms.create('chimeAlarm', {
                delayInMinutes: delayMinutesExact,
                periodInMinutes: intervalMinutes
            });
        }
        
        console.log('Alarm created with settings:', settings);
    },
    
    // 알람 제거
    async clearAlarm() {
        await chrome.alarms.clearAll();
    }
};

// 배지 관리자
const BadgeManager = {
    // 배지 텍스트 설정
    setBadgeText: function(isActive) {
        chrome.action.setBadgeText({ text: isActive ? 'ON' : 'OFF' });
        chrome.action.setBadgeBackgroundColor({ 
            color: isActive ? '#4CAF50' : '#9e9e9e' 
        });
    }
};

// 메시지 리스너 설정
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Received message:', message);
    
    if (message.action === 'updateAlarm') {
        AlarmManager.createAlarm(message);
    }
    switch (message.type) {
        case 'toggleTimer':
            if (message.isActive) {
                chrome.storage.local.get(['interval', 'customInterval'], function(result) {
                    AlarmManager.createAlarm({
                        interval: result.interval || '15',
                        customInterval: result.customInterval
                    });
                });
            } else {
                AlarmManager.clearAlarm();
            }
            BadgeManager.setBadgeText(message.isActive);
            break;
    }
});

// 알람 리스너 설정
chrome.alarms.onAlarm.addListener(async (alarm) => {
    console.log('Alarm triggered:', alarm);
    
    if (alarm.name === 'chimeAlarm') {
        try {
            // 현재 설정된 사운드와 볼륨 가져오기
            const { isActive, selectedSound, volume } = await chrome.storage.local.get(['isActive', 'selectedSound', 'volume']);

            if (!isActive) {
                console.log('Alarm triggered, but timer is not active.');
                return;
            }

            // 사운드 재생
            await AudioManager.playSound(selectedSound || 'chime1', volume || 50);
            
            // 다음 알람 시간 계산 및 팝업에 바꾸라고 알림
            const nextAlarm = await chrome.alarms.get('chimeAlarm');
            if (nextAlarm) {
                chrome.runtime.sendMessage({
                    type: 'updateNextChimeTime',
                    nextChimeTime: new Date(nextAlarm.scheduledTime)
                });
            }
        } catch (error) {
            console.error('Error handling alarm:', error);
        }
    }
});

// 익스텐션 설치/업데이트 시 초기화
chrome.runtime.onInstalled.addListener(async () => {
    await AudioManager.createOffscreenDocument();
    const settings = await chrome.storage.local.get(['isActive', 'interval', 'customInterval']);
    if (settings.isActive) {
        await AlarmManager.createAlarm({
            interval: settings.interval || '15',
            customInterval: settings.customInterval
        });
    }
    BadgeManager.setBadgeText(settings.isActive || false);
});

// 브라우저 시작 시 배지 상태 복원
chrome.runtime.onStartup.addListener(async () => {
    await AudioManager.createOffscreenDocument();
    const settings = await chrome.storage.local.get(['isActive', 'interval', 'customInterval']);
    BadgeManager.setBadgeText(settings.isActive || false);
    if (settings.isActive) {
        await AlarmManager.createAlarm({
            interval: settings.interval || '15',
            customInterval: settings.customInterval
        });
    }
});
