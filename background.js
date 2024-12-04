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
    
    // 사운드 재생
    async playSound(soundName, volume) {
        try {
            await this.createOffscreenDocument();
            
            let soundUrl;
            let filename;
            
            // 기본 사운드인 경우
            if (soundName.startsWith('chime')) {
                filename = soundName + '.mp3';
                soundUrl = chrome.runtime.getURL('sounds/' + filename);
            } else {
                // 커스텀 사운드인 경우
                const result = await chrome.storage.local.get(['customSound']);
                if (result.customSound) {
                    soundUrl = result.customSound;
                } else {
                    // 기본값으로 fallback
                    filename = 'chime1.mp3';
                    soundUrl = chrome.runtime.getURL('sounds/' + filename);
                }
            }
            
            // 오디오 재생 메시지 전송
            chrome.runtime.sendMessage({
                type: 'play-sound',
                target: 'offscreen',
                data: {
                    soundUrl: soundUrl,
                    volume: volume / 100
                }
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
            
            // 유효성 검사
            if (intervalMinutes < 1) intervalMinutes = 15;
            
            await chrome.alarms.create('chimeAlarm', {
                delayInMinutes: intervalMinutes,
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
                chrome.storage.sync.get(['interval', 'customInterval'], function(result) {
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
            const settings = await chrome.storage.sync.get(['isActive', 'selectedSound', 'volume']);
            console.log('Retrieved settings:', settings);
            
            if (settings.isActive) {
                const soundName = settings.selectedSound || 'chime1';
                const volume = settings.volume || 50;
                await AudioManager.playSound(soundName, volume);
                console.log('Playing sound:', { soundName, volume });
            }
        } catch (error) {
            console.error('Error handling alarm:', error);
        }
    }
});

// 익스텐션 설치/업데이트 시 초기화
chrome.runtime.onInstalled.addListener(async () => {
    await AudioManager.createOffscreenDocument();
    const settings = await chrome.storage.sync.get(['isActive', 'interval', 'customInterval']);
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
    const settings = await chrome.storage.sync.get(['isActive', 'interval', 'customInterval']);
    BadgeManager.setBadgeText(settings.isActive || false);
    if (settings.isActive) {
        await AlarmManager.createAlarm({
            interval: settings.interval || '15',
            customInterval: settings.customInterval
        });
    }
});

// 확장 프로그램이 종료될 때 리소스 정리
chrome.runtime.onSuspend.addListener(() => {
    // 리소스 정리 코드 추가 필요
});