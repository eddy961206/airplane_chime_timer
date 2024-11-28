// 오디오 플레이어 관리자
const AudioManager = {
    // 오디오 플레이어 초기화
    async createOffscreenDocument() {
        try {
            // 이미 존재하는 문서가 있는지 확인
            const existingDocument = await chrome.offscreen.hasDocument();
            if (existingDocument) {
                return;
            }
            
            // 새로운 offscreen 문서 생성
            await chrome.offscreen.createDocument({
                url: 'audio-player.html',
                reasons: ['AUDIO_PLAYBACK'],
                justification: 'Playing airplane chime sounds'
            });
            console.log('Offscreen document created successfully');
        } catch (error) {
            console.error('Error creating offscreen document:', error);
        }
    },
    
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
    
    // 사운드 재생
    async playSound() {
        try {
            // offscreen 문서가 없으면 생성
            await this.createOffscreenDocument();
            
            // 설정 가져오기
            const settings = await chrome.storage.local.get(['selectedSound', 'volume']);
            const soundName = settings.selectedSound || 'chime1';
            const volume = settings.volume || 50;
            
            // sounds.json에서 실제 파일명 가져오기
            const soundInfo = await this.getSoundInfo(soundName);
            if (!soundInfo) {
                throw new Error(`Sound info not found for: ${soundName}`);
            }
            
            // 설정값과 함께 메시지 전송
            await chrome.runtime.sendMessage({ 
                type: 'playSound',
                soundName: soundInfo.value,
                filename: soundInfo.filename,
                volume: volume
            });
            console.log('Playback requested with:', { 
                soundName: soundInfo.value, 
                filename: soundInfo.filename, 
                volume,
                time: new Date().toLocaleTimeString()
            });
        } catch (error) {
            console.error('Error requesting sound playback:', error);
            // 오류 발생 시 offscreen 문서 재생성 시도
            try {
                await chrome.offscreen.closeDocument();
                await this.createOffscreenDocument();
            } catch (e) {
                console.error('Error recreating offscreen document:', e);
            }
        }
    }
};

// 알람 관리자
const AlarmManager = {
    // 알람 생성
    createAlarm: function(interval) {
        // interval이 유효한 숫자인지 확인
        if (!interval || isNaN(interval)) {
            interval = 15; // 기본값 설정
        }
        
        // 현재 시간에서 다음 간격까지의 시간 계산
        const now = new Date();
        const minutes = now.getMinutes();
        const nextMinutes = Math.ceil(minutes / interval) * interval;
        let delayInMinutes = nextMinutes - minutes;
        // let delayInMinutes = 0.1;
        
        // delayInMinutes가 0이면 다음 간격으로 설정
        if (delayInMinutes <= 0) {
            delayInMinutes = parseInt(interval);
        }
        
        console.log('Creating alarm with:', {
            interval: interval,
            delayInMinutes: delayInMinutes,
            currentMinutes: minutes,
            nextMinutes: nextMinutes,
            currentTime: now.toLocaleTimeString(),
            nextAlarmTime: new Date(now.getTime() + delayInMinutes * 60000).toLocaleTimeString()
        });
        
        // 알람 생성
        chrome.alarms.create('chimeAlarm', {
            delayInMinutes: delayInMinutes,
            periodInMinutes: parseInt(interval)
        });
    },
    
    // 알람 제거
    clearAlarm: function() {
        chrome.alarms.clear('chimeAlarm');
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
    switch (message.type) {
        case 'toggleTimer':
            if (message.isActive) {
                chrome.storage.local.get(['interval'], function(result) {
                    const interval = result.interval || 15; // 기본값 설정
                    AlarmManager.createAlarm(interval);
                });
            } else {
                AlarmManager.clearAlarm();
            }
            BadgeManager.setBadgeText(message.isActive);
            break;
            
        case 'updateInterval':
            chrome.storage.local.get(['isActive'], function(result) {
                if (result.isActive) {
                    AlarmManager.clearAlarm();
                    AlarmManager.createAlarm(message.interval);
                }
            });
            break;
    }
});

// 알람 리스너 설정
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'chimeAlarm') {
        // 다음 알람 시간 계산을 위해 현재 설정 가져오기
        const settings = await chrome.storage.local.get(['interval']);
        const interval = settings.interval || 15;
        const now = new Date();
        const nextAlarm = new Date(now.getTime() + interval * 60000);

        console.log('Alarm cycle:', {
            currentTime: now.toLocaleTimeString(),
            nextAlarmTime: nextAlarm.toLocaleTimeString(),
            interval: interval
        });

        await AudioManager.playSound();
        
        // 현재 활성화된 모든 알람 정보 출력
        const activeAlarms = await chrome.alarms.getAll();
        console.log('Active alarms:', activeAlarms);
    }
});

// 익스텐션 설치/업데이트 시 초기화
chrome.runtime.onInstalled.addListener(async () => {
    await AudioManager.createOffscreenDocument();
    const settings = await chrome.storage.local.get(['isActive', 'interval']);
    if (settings.isActive) {
        const interval = settings.interval || 15; // 기본값 설정
        AlarmManager.createAlarm(interval);
    }
    BadgeManager.setBadgeText(settings.isActive || false);
});

// 브라우저 시작 시 배지 상태 복원
chrome.runtime.onStartup.addListener(async () => {
    await AudioManager.createOffscreenDocument();
    const settings = await chrome.storage.local.get(['isActive', 'interval']);
    BadgeManager.setBadgeText(settings.isActive || false);
    if (settings.isActive) {
        const interval = settings.interval || 15; // 기본값 설정
        AlarmManager.createAlarm(interval);
    }
}); 