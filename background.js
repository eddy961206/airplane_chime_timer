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
        let nextAlarmTime; // 다음 알람 시각 저장 변수
        
        // 지정된 시각에 알람 생성
        if (interval === 'specific' && specificTime) {
            const [hours, minutes] = specificTime.split(':').map(Number);
            nextAlarmTime  = new Date(now);
            nextAlarmTime .setHours(hours, minutes, 0, 0);
            
            if (nextAlarmTime  <= now) {
                nextAlarmTime .setDate(nextAlarmTime .getDate() + 1);
            }
            
            await chrome.alarms.create('chimeAlarm', {
                when: nextAlarmTime.getTime(),
                periodInMinutes: repeatDaily ? 24 * 60 : undefined
            });
        } else if (interval === 'custom') {
        // 커스텀 인터벌: 지금부터 지정된 시간 뒤에 알람 설정
            const customIntervalMinutes = parseInt(customInterval) || 15;

            // 유효성 검사
            if (customIntervalMinutes < 1) {
                console.warn('Invalid custom interval. Defaulting to 15 minutes.');
                customIntervalMinutes = 15;
            }

            // 다음 간격까지의 시간 계산
            const nextMinutes = Math.ceil(minutes / customIntervalMinutes) * customIntervalMinutes;
            const delayInMinutes = nextMinutes - minutes;

            // 초를 고려한 정확한 지연 시간 계산
            let delayMinutesExact = delayInMinutes - (seconds / 60);
            if (delayMinutesExact <= 0) {
                delayMinutesExact += customIntervalMinutes;
            }

            // 다음 알람 시각 계산 (지금 시간 + 커스텀 인터벌)
            nextAlarmTime = new Date(now.getTime() + delayMinutesExact * 60000);

            // 초와 밀리초 제거
            nextAlarmTime.setSeconds(0, 0);

            await chrome.alarms.create('chimeAlarm', {
                delayInMinutes: delayMinutesExact,
                periodInMinutes: customIntervalMinutes // 반복 주기는 커스텀 인터벌
            });
            
        } else {
        // 일반 인터벌: 현재 시간 기준으로 가장 가까운 다음 시간에 설정
            let intervalMinutes = parseInt(interval) || 15;
    
            // 유효성 검사
            if (intervalMinutes < 1) {
                console.warn('Invalid interval. Defaulting to 15 minutes.');
                intervalMinutes = 15;
            }
    
            // 다음 간격까지의 시간 계산
            const nextMinutes = Math.ceil(minutes / intervalMinutes) * intervalMinutes;
            let delayInMinutes = nextMinutes - minutes;
    
            // 초를 고려한 정확한 지연 시간 계산
            let delayMinutesExact = delayInMinutes - (seconds / 60);
            /*  
            지금 시간 기준으로 실제 다음 알람 시간이 즉시 혹은 
            이미 지난 시간으로 계산되어 '바로' 알람이 울려버리는 경우 없애기 위함*/
            if (delayMinutesExact <= 0) {
                // 음수나 0인 경우 다음 인터벌을 잡아 미래 시간으로 설정
                delayMinutesExact += intervalMinutes;
            }
    
            // 다음 알람 시각 계산
            nextAlarmTime = new Date(now.getTime() + delayMinutesExact * 60000);
    
            await chrome.alarms.create('chimeAlarm', {
                delayInMinutes: delayMinutesExact,
                periodInMinutes: intervalMinutes
            });
        }
        
        console.log('Alarm created with settings:', settings, 'Next alarm at:', nextAlarmTime.toLocaleString());
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
chrome.runtime.onInstalled.addListener(async (details) => {
    await AudioManager.createOffscreenDocument();
    const settings = await chrome.storage.local.get(['isActive', 'interval', 'customInterval']);
    if (settings.isActive) {
        await AlarmManager.createAlarm({
            interval: settings.interval || '15',
            customInterval: settings.customInterval
        });
    }
    BadgeManager.setBadgeText(settings.isActive || false);

    // 새로 설치된 경우에만 웰컴 페이지 열기
    if (details.reason === 'install') {
        chrome.tabs.create({
            url: 'welcome.html'
        });
    }
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
