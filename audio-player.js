const player = document.getElementById('chimePlayer');
let currentBlobUrl = null;

// 메시지 리스너 설정
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.type === 'playSound') {
        try {
            const volume = message.volume / 100;
            let soundUrl;

            if (message.isCustomSound) {
                // 이전 Blob URL 해제
                if (currentBlobUrl) {
                    URL.revokeObjectURL(currentBlobUrl);
                }

                // Base64 데이터를 Blob으로 변환
                const base64Data = message.soundUrl.split(',')[1];
                const byteCharacters = atob(base64Data);
                const byteNumbers = new Array(byteCharacters.length);
                
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'audio/mpeg' });
                
                // Blob URL 생성
                currentBlobUrl = URL.createObjectURL(blob);
                soundUrl = currentBlobUrl;
            } else {
                soundUrl = chrome.runtime.getURL(`sounds/${message.filename}`);
            }
            
            player.src = soundUrl;
            player.volume = volume;
            await player.play();

        } catch (error) {
            console.error('Error playing sound:', error);
        }
    }
});