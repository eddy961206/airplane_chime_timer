const player = document.getElementById('chimePlayer');

// 메시지 리스너 설정
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.type === 'playSound') {
        try {
            const volume = message.volume / 100;
            
            // 정확한 URL 생성 (실제 파일명 사용)
            const soundUrl = chrome.runtime.getURL(`sounds/${message.filename}`);
            console.log('Playing sound from URL:', soundUrl);
            
            player.src = soundUrl;
            player.volume = volume;
            await player.play();
            console.log('Sound played successfully:', { 
                soundName: message.soundName,
                filename: message.filename,
                volume: volume 
            });
        } catch (error) {
            console.error('Error playing sound:', error);
        }
    }
}); 