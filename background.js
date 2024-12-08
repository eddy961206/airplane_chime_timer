// [설명] 백그라운드 스크립트로, 알람 생성/해제, 사운드 재생 요청 처리, 배지 업데이트 등을 담당.
//        팝업이나 다른 컴포넌트에서 메시지를 받아 처리하거나,
//        알람 트리거 시 사운드를 재생하는 로직을 포함.

// 오디오 재생 담당 (오프스크린 문서 활용)
const AudioManager = {
    // 오프스크린 문서 생성
    async createOffscreenDocument() {
        if (await chrome.offscreen.hasDocument()) return;
        await chrome.offscreen.createDocument({
            url: 'audio-player.html',
            reasons: ['AUDIO_PLAYBACK'],
            justification: 'Playing alarm sound'
        });
    },

    // sounds.json에서 기본 사운드 정보 가져오기
    async getSoundInfoFromJson(soundName) {
        try {
            const response = await fetch(chrome.runtime.getURL('sounds/sounds.json'));
            const data = await response.json();
            return data.sounds.find(sound => sound.value === soundName);
        } catch (error) {
            console.error('sounds.json 로드 실패:', error);
            return null;
        }
    },
    
    // 사운드 재생 (백그라운드에서 오프스크린으로 메시지 전송)
    async playSound(soundName, volume) {
        try {
            await this.createOffscreenDocument();
            
            let soundUrl;
            let filename;

            if (soundName.startsWith('custom')) {
                const { customSounds } = await chrome.storage.local.get('customSounds');
                const customSound = customSounds.find(sound => sound.value === soundName);
                if (!customSound) {
                    throw new Error('커스텀 사운드 정보를 찾을 수 없습니다.');
                }
                
                soundUrl = customSound.data;  // base64 데이터 직접 사용
                filename = customSound.filename;
            } else {
                const soundInfo = await this.getSoundInfoFromJson(soundName);
                if (!soundInfo) {
                    throw new Error(`사운드 정보 찾기 실패: ${soundName}`);
                }
                soundUrl = chrome.runtime.getURL(`sounds/${soundInfo.filename}`);
                filename = soundInfo.filename;
            }
            
            chrome.runtime.sendMessage({
                type: 'playSound',
                soundUrl: soundUrl,
                filename: filename,
                volume: volume,
                isCustomSound: soundName.startsWith('custom')
            });
            
            console.log('사운드 재생 요청 완료:', { soundName, volume });
            
        } catch (error) {
            console.error('사운드 재생 오류:', error);
        }
    }
};

// 알람 관리 객체
const AlarmManager = {
    // 알람 생성
    async createAlarm(settings) {
        const { interval, customInterval, specificTime, repeatDaily } = settings;
        
        // 기존 알람 모두 제거
        await chrome.alarms.clearAll();
        
        const now = new Date();
        const minutes = now.getMinutes();
        const seconds = now.getSeconds();
        let nextAlarmTime;
        
        // 특정 시각 알람
        if (interval === 'specific' && specificTime) {
            const [hours, mins] = specificTime.split(':').map(Number);
            nextAlarmTime = new Date(now);
            nextAlarmTime.setHours(hours, mins, 0, 0);
            
            if (nextAlarmTime <= now) {
                nextAlarmTime.setDate(nextAlarmTime.getDate() + 1);
            }
            
            await chrome.alarms.create('chimeAlarm', {
                when: nextAlarmTime.getTime(),
                periodInMinutes: repeatDaily ? 24 * 60 : undefined
            });
        } else if (interval === 'custom') {
            // 커스텀 인터벌
            let customIntervalMinutes = parseInt(customInterval) || 15;
            if (customIntervalMinutes < 1) {
                console.warn('유효하지 않은 커스텀 인터벌. 15분으로 대체합니다.');
                customIntervalMinutes = 15;
            }

            const nextMinutes = Math.ceil(minutes / customIntervalMinutes) * customIntervalMinutes;
            let delayMinutesExact = nextMinutes - minutes - (seconds / 60);
            if (delayMinutesExact <= 0) {
                delayMinutesExact += customIntervalMinutes;
            }

            nextAlarmTime = new Date(now.getTime() + delayMinutesExact * 60000);
            nextAlarmTime.setSeconds(0, 0);

            await chrome.alarms.create('chimeAlarm', {
                delayInMinutes: delayMinutesExact,
                periodInMinutes: customIntervalMinutes
            });

        } else {
            // 일반 인터벌
            let intervalMinutes = parseInt(interval) || 15;
            if (intervalMinutes < 1) {
                console.warn('유효하지 않은 인터벌. 15분으로 대체합니다.');
                intervalMinutes = 15;
            }

            const nextMinutes = Math.ceil(minutes / intervalMinutes) * intervalMinutes;
            let delayMinutesExact = nextMinutes - minutes - (seconds / 60);
            if (delayMinutesExact <= 0) {
                delayMinutesExact += intervalMinutes;
            }

            nextAlarmTime = new Date(now.getTime() + delayMinutesExact * 60000);
            nextAlarmTime.setSeconds(0, 0);

            await chrome.alarms.create('chimeAlarm', {
                delayInMinutes: delayMinutesExact,
                periodInMinutes: intervalMinutes
            });
        }
        
        console.log('알람 생성 완료:', settings, '다음 알람 시간:', nextAlarmTime.toLocaleString());
    },
    
    // 알람 제거
    async clearAlarm() {
        await chrome.alarms.clearAll();
    }
};

// 배지 표시 관리
const BadgeManager = {
    setBadgeText: function(isActive) {
        chrome.action.setBadgeText({ text: isActive ? 'ON' : 'OFF' });
        chrome.action.setBadgeBackgroundColor({ 
            color: isActive ? '#4CAF50' : '#9e9e9e' 
        });
    }
};

// 메시지 리스너
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('메시지 수신:', message);
    
    if (message.action === 'updateAlarm') {
        // 알람 업데이트 요청 시
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

// 알람 트리거 처리
chrome.alarms.onAlarm.addListener(async (alarm) => {
    console.log('알람 트리거 발생:', alarm);
    
    if (alarm.name === 'chimeAlarm') {
        try {
            const { isActive, selectedSound, volume } = await chrome.storage.local.get(['isActive', 'selectedSound', 'volume']);
            if (!isActive) {
                console.log('알람 발생했으나 타이머가 비활성화 상태입니다.');
                return;
            }

            // 사운드 재생 요청
            await AudioManager.playSound(selectedSound || 'chime1', volume || 50);
            
            // 다음 알람 시간 갱신 정보 팝업에 전달
            const nextAlarm = await chrome.alarms.get('chimeAlarm');
            if (nextAlarm) {
                chrome.runtime.sendMessage({
                    type: 'updateNextChimeTime',
                    nextChimeTime: new Date(nextAlarm.scheduledTime)
                });
            }
        } catch (error) {
            console.error('알람 처리 중 오류:', error);
        }
    }
});

// 확장 프로그램 설치/업데이트 시 처리
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

    if (details.reason === 'install') {
        chrome.tabs.create({ url: 'welcome.html' });
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
