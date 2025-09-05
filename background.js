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
    // 단일 타이머 알람 생성
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
    
    // 듀얼 타이머 알람 생성
    async createDualTimerAlarm(dualTimer) {
        const { shortInterval, longInterval, shortSound, longSound } = dualTimer;
        
        // 기존 알람 모두 제거
        await chrome.alarms.clearAll();
        
        const now = new Date();
        const currentMinutes = now.getMinutes();
        const currentSeconds = now.getSeconds();
        
        // 첫 번째 타이머 (짧은 주기) 설정
        const shortIntervalMinutes = parseInt(shortInterval);
        const shortNextMinutes = Math.ceil(currentMinutes / shortIntervalMinutes) * shortIntervalMinutes;
        let shortDelayExact = shortNextMinutes - currentMinutes - (currentSeconds / 60);
        if (shortDelayExact <= 0) {
            shortDelayExact += shortIntervalMinutes;
        }
        
        await chrome.alarms.create('shortTimer', {
            delayInMinutes: shortDelayExact,
            periodInMinutes: shortIntervalMinutes
        });
        
        // 두 번째 타이머 (긴 주기) 설정
        const longIntervalMinutes = parseInt(longInterval);
        const longNextMinutes = Math.ceil(currentMinutes / longIntervalMinutes) * longIntervalMinutes;
        let longDelayExact = longNextMinutes - currentMinutes - (currentSeconds / 60);
        if (longDelayExact <= 0) {
            longDelayExact += longIntervalMinutes;
        }
        
        await chrome.alarms.create('longTimer', {
            delayInMinutes: longDelayExact,
            periodInMinutes: longIntervalMinutes
        });
        
        console.log('듀얼 타이머 알람 생성 완료:', {
            shortInterval: shortIntervalMinutes,
            longInterval: longIntervalMinutes,
            shortDelay: shortDelayExact,
            longDelay: longDelayExact
        });
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
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    console.log('메시지 수신:', message);
    
    if (message.action === 'updateAlarm') {
        // 단일 타이머 알람 업데이트 요청
        AlarmManager.createAlarm(message);
    }

    switch (message.type) {
        case 'toggleTimer':
            if (message.isActive) {
                // 현재 설정에 따라 단일 또는 듀얼 타이머 시작
                const settings = await chrome.storage.local.get(['timerMode', 'interval', 'customInterval', 'dualTimer']);
                
                if (settings.timerMode === 'dual' && settings.dualTimer) {
                    await AlarmManager.createDualTimerAlarm(settings.dualTimer);
                } else {
                    // 단일 모드 또는 기본값
                    await AlarmManager.createAlarm({
                        interval: settings.interval || '15',
                        customInterval: settings.customInterval
                    });
                }
            } else {
                AlarmManager.clearAlarm();
            }
            BadgeManager.setBadgeText(message.isActive);
            break;
            
        case 'updateDualTimer':
            // 듀얼 타이머 설정 업데이트
            const { isActive } = await chrome.storage.local.get('isActive');
            if (isActive) {
                await AlarmManager.createDualTimerAlarm(message.dualTimer);
            }
            break;
    }
});

// 알람 트리거 처리
chrome.alarms.onAlarm.addListener(async (alarm) => {
    console.log('알람 트리거 발생:', alarm);
    
    try {
        const settings = await chrome.storage.local.get([
            'isActive', 'timerMode', 'selectedSound', 'volume', 'dualTimer'
        ]);
        
        if (!settings.isActive) {
            console.log('알람 발생했으나 타이머가 비활성화 상태입니다.');
            return;
        }
        
        let soundToPlay, volume = settings.volume || 50;
        
        // 단일 타이머 처리
        if (alarm.name === 'chimeAlarm') {
            soundToPlay = settings.selectedSound || 'chime1';
        }
        // 듀얼 타이머 처리
        else if (settings.timerMode === 'dual' && settings.dualTimer) {
            const now = new Date();
            const currentMinutes = now.getMinutes();
            
            if (alarm.name === 'shortTimer') {
                // 짧은 주기 알람 - 겹치는 시간인지 확인
                const longInterval = parseInt(settings.dualTimer.longInterval);
                const isOverlapTime = (currentMinutes % longInterval === 0);
                
                if (isOverlapTime) {
                    console.log('겹치는 시간: 긴 주기 사운드 재생');
                    soundToPlay = settings.dualTimer.longSound;
                } else {
                    console.log('비겹치는 시간: 짧은 주기 사운드 재생');
                    soundToPlay = settings.dualTimer.shortSound;
                }
            } else if (alarm.name === 'longTimer') {
                // 긴 주기 알람 - 항상 우선순위
                console.log('긴 주기 알람: 긴 주기 사운드 재생');
                soundToPlay = settings.dualTimer.longSound;
            }
        }
        
        if (soundToPlay) {
            await AudioManager.playSound(soundToPlay, volume);
        }
        
        // 단일 모드에서만 다음 알람 시간 전달
        if (alarm.name === 'chimeAlarm') {
            const nextAlarm = await chrome.alarms.get('chimeAlarm');
            if (nextAlarm) {
                chrome.runtime.sendMessage({
                    type: 'updateNextChimeTime',
                    nextChimeTime: new Date(nextAlarm.scheduledTime)
                }).catch(() => {
                    // 메시지 전송 실패 시 무시 (팝업이 닫혔을 수 있음)
                });
            }
        }
    } catch (error) {
        console.error('알람 처리 중 오류:', error);
    }
});

// 확장 프로그램 설치/업데이트 시 처리
chrome.runtime.onInstalled.addListener(async (details) => {
    await AudioManager.createOffscreenDocument();
    const settings = await chrome.storage.local.get([
        'isActive', 'timerMode', 'interval', 'customInterval', 'dualTimer'
    ]);
    
    if (settings.isActive) {
        if (settings.timerMode === 'dual' && settings.dualTimer) {
            await AlarmManager.createDualTimerAlarm(settings.dualTimer);
        } else {
            await AlarmManager.createAlarm({
                interval: settings.interval || '15',
                customInterval: settings.customInterval
            });
        }
    }
    BadgeManager.setBadgeText(settings.isActive || false);

    if (details.reason === 'install') {
        chrome.tabs.create({ url: 'welcome.html' });
    }
});

// 브라우저 시작 시 배지 상태 복원
chrome.runtime.onStartup.addListener(async () => {
    await AudioManager.createOffscreenDocument();
    const settings = await chrome.storage.local.get([
        'isActive', 'timerMode', 'interval', 'customInterval', 'dualTimer'
    ]);
    BadgeManager.setBadgeText(settings.isActive || false);
    
    if (settings.isActive) {
        if (settings.timerMode === 'dual' && settings.dualTimer) {
            await AlarmManager.createDualTimerAlarm(settings.dualTimer);
        } else {
            await AlarmManager.createAlarm({
                interval: settings.interval || '15',
                customInterval: settings.customInterval
            });
        }
    }
});
