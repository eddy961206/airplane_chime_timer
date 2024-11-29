chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      // 웰컴 페이지 열기
      chrome.tabs.create({
        url: 'welcome.html'
      });
    }
});

// 오디오 플레이어 관리자
const AudioManager = {
    blobUrl: null,
    
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
            await this.createOffscreenDocument();
            
            const settings = await chrome.storage.local.get(['selectedSound', 'volume']);
            const soundName = settings.selectedSound || 'chime1';
            const volume = settings.volume || 50;
            
            let soundUrl;
            let filename;
            
            if (soundName === 'custom') {
                const { customSound } = await chrome.storage.local.get('customSound');
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
                filename = customSound.filename;
            } else {
                const soundInfo = await this.getSoundInfo(soundName);
                if (!soundInfo) {
                    throw new Error(`Sound info not found for: ${soundName}`);
                }
                soundUrl = chrome.runtime.getURL(`sounds/${soundInfo.filename}`);
                filename = soundInfo.filename;
            }
            
            await chrome.runtime.sendMessage({ 
                type: 'playSound',
                soundName,
                soundUrl,
                filename,
                volume
            });
            
        } catch (error) {
            console.error('Error requesting sound playback:', error);
            try {
                await chrome.offscreen.closeDocument();
                await this.createOffscreenDocument();
            } catch (e) {
                console.error('Error recreating offscreen document:', e);
            }
        }
    },
    
    cleanup: function() {
        if (this.blobUrl) {
            URL.revokeObjectURL(this.blobUrl);
            this.blobUrl = null;
        }
    }
};

// 확장 프로그램이 종료될 때 리소스 정리
chrome.runtime.onSuspend.addListener(() => {
    AudioManager.cleanup();
});

// 알람 관리자
const AlarmManager = {
    // 알람 생성
    createAlarm: function(interval) {
        // interval이 유효한 숫자인지 확인
        if (!interval || isNaN(interval)) {
            interval = 15; // 기본값 설정
        }
        
        // 현재 시간 정보 가져오기
        const now = new Date();
        const minutes = now.getMinutes();
        const seconds = now.getSeconds();
        
        // 다음 간격까지의 시간 계산
        const nextMinutes = Math.ceil(minutes / interval) * interval;
        let delayInMinutes = nextMinutes - minutes;
        
        // delayInMinutes가 0이면 다음 간격으로 설정
        if (delayInMinutes <= 0) {
            delayInMinutes = parseInt(interval);
        }
        
        // 초를 고려한 정확한 지연 시간 계산
        const delayMinutesExact = delayInMinutes - (seconds / 60);
        
        // 다음 알람 시간 계산
        const nextAlarmTime = new Date(now.getTime() + delayInMinutes * 60000);
        nextAlarmTime.setSeconds(0); // 정확히 0초로 설정
        
        console.log('Creating alarm with:', {
            interval: interval,
            currentTime: now.toLocaleTimeString(),
            delayInMinutes: delayMinutesExact,
            nextAlarmTime: nextAlarmTime.toLocaleTimeString(),
            currentSeconds: seconds
        });
        
        // 알람 생성
        chrome.alarms.create('chimeAlarm', {
            delayInMinutes: delayMinutesExact,
            periodInMinutes: parseInt(interval)
        });
        
        // 다음 알람 시간 저장
        chrome.storage.local.set({
            nextAlarmTime: nextAlarmTime.toLocaleTimeString()
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
        const now = new Date();
        console.log('Alarm triggered at:', now.toLocaleTimeString());
        
        // 현재 설정 가져오기
        const settings = await chrome.storage.local.get(['interval']);
        const interval = settings.interval || 15;
        
        // 다음 알람 시간 계산 및 저장
        const nextAlarm = new Date(now.getTime() + interval * 60000);
        nextAlarm.setSeconds(0); // 정확히 0초로 설정
        
        chrome.storage.local.set({
            nextAlarmTime: nextAlarm.toLocaleTimeString()
        });
        
        await AudioManager.playSound();
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