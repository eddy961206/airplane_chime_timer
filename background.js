// 알람 관리자
const AlarmManager = {
    // 알람 생성
    createAlarm: function(interval) {
        // 현재 시간에서 다음 간격까지의 시간 계산
        const now = new Date();
        const minutes = now.getMinutes();
        const nextMinutes = Math.ceil(minutes / interval) * interval;
        const delayInMinutes = nextMinutes - minutes;
        
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
                    AlarmManager.createAlarm(result.interval);
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
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'chimeAlarm') {
        // 알람이 울릴 때 popup.html에 메시지를 보내서 소리를 재생하도록 함
        chrome.runtime.sendMessage({ type: 'playChime' });
    }
});

// 익스텐션 설치/업데이트 시 초기화
chrome.runtime.onInstalled.addListener(async () => {
    const settings = await chrome.storage.local.get(['isActive', 'interval']);
    if (settings.isActive) {
        AlarmManager.createAlarm(settings.interval);
    }
    BadgeManager.setBadgeText(settings.isActive || false);
});

// 브라우저 시작 시 배지 상태 복원
chrome.runtime.onStartup.addListener(async () => {
    const settings = await chrome.storage.local.get(['isActive']);
    BadgeManager.setBadgeText(settings.isActive || false);
}); 