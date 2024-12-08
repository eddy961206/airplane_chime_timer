// [설명] 오프스크린 문서 내 스크립트 파일.
//        background.js에서 메시지를 받아 오디오 재생을 수행.

const player = document.getElementById('chimePlayer');
let currentBlobUrl = null;

// 메시지 리스너
chrome.runtime.onMessage.addListener(async (message) => {
    if (message.type === 'playSound') {
        try {
            const volume = message.volume / 100;
            let soundUrl;

            // 이전 Blob URL 정리
            if (currentBlobUrl) {
                URL.revokeObjectURL(currentBlobUrl);
                currentBlobUrl = null;
            }

            // 커스텀 사운드 처리 (base64 -> Blob)
            if (message.isCustomSound) {
                const base64Data = message.soundUrl.split(',')[1];
                const byteCharacters = atob(base64Data);
                const byteNumbers = new Array(byteCharacters.length);
                
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'audio/mpeg' });
                
                currentBlobUrl = URL.createObjectURL(blob);
                soundUrl = currentBlobUrl;
            } else {
                // 기본 사운드
                soundUrl = chrome.runtime.getURL(`sounds/${message.filename}`);
            }
            
            player.src = soundUrl;
            player.volume = volume;
            await player.play();

            console.log('오프스크린에서 사운드 재생 성공:', message.filename);
        } catch (error) {
            console.error('오프스크린 사운드 재생 실패:', error);
        }
    }
});
