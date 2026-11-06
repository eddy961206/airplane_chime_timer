(() => {
  'use strict';

  const player = document.getElementById('chimePlayer');
  const MAX_AUDIO_BYTES = 1024 * 1024;
  const MAX_DATA_URL_LENGTH = Math.ceil(MAX_AUDIO_BYTES / 3) * 4 + 100;
  const PLAYBACK_TIMEOUT_MS = 10000;
  let currentPlayback = null;

  function isTrustedSender(sender) {
    // 콘텐츠 스크립트/다른 확장 프로그램은 거절한다. Chrome 버전에 따라 워커 URL은 없을 수 있다.
    return sender?.id === chrome.runtime.id && !sender.tab
      && (!sender.url || sender.url === chrome.runtime.getURL('background.js'));
  }

  function validateMessage(message) {
    if (typeof message.volume !== 'number' || !Number.isFinite(message.volume)
      || message.volume < 0 || message.volume > 100) throw new Error('Invalid playback volume.');
    if (typeof message.isCustomSound !== 'boolean') throw new Error('Invalid sound type.');
    if (typeof message.filename !== 'string' || !message.filename || message.filename.length > 255) {
      throw new Error('Invalid audio filename.');
    }
    if (!message.isCustomSound) {
      // 번들 안의 파일명만 허용하며 경로 이동, URL, 쿼리 및 인코딩 우회를 막는다.
      if (/[\\/:%?#\x00-\x1f\x7f]/.test(message.filename)
        || !/\.(mp3|m4a|wav|ogg|aac|flac|opus|webm)$/i.test(message.filename)) {
        throw new Error('Invalid bundled audio path.');
      }
      return;
    }
    if (typeof message.soundUrl !== 'string' || message.soundUrl.length > MAX_DATA_URL_LENGTH) {
      throw new Error('Custom audio must be at most 1 MB.');
    }
    if (!/^data:audio\/[a-z0-9][a-z0-9.+-]*;base64,/i.test(message.soundUrl)) {
      throw new Error('Custom sound must contain base64 audio data.');
    }
  }

  function createSource(message) {
    if (!message.isCustomSound) {
      return { src: chrome.runtime.getURL(`sounds/${encodeURIComponent(message.filename)}`), blobUrl: null };
    }
    const separator = message.soundUrl.indexOf(',');
    const header = message.soundUrl.slice(0, separator);
    const encoded = message.soundUrl.slice(separator + 1);
    if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
      throw new Error('Invalid base64 audio data.');
    }
    const decoded = atob(encoded);
    if (!decoded.length || decoded.length > MAX_AUDIO_BYTES) throw new Error('Custom audio must be at most 1 MB.');
    const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
    const mimeType = header.slice(5, -7);
    const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
    return { src: blobUrl, blobUrl };
  }

  function stopPlayback(error) {
    const playback = currentPlayback;
    if (!playback) return;
    currentPlayback = null;
    clearTimeout(playback.timeout);
    // 먼저 미디어를 분리한 뒤 URL을 해제한다. 이전 재생의 완료 콜백은 새 URL을 해제할 수 없다.
    player.pause();
    player.removeAttribute('src');
    player.load();
    if (playback.blobUrl) URL.revokeObjectURL(playback.blobUrl);
    if (playback.reject) playback.reject(error || new Error('Playback was replaced by a newer sound.'));
  }

  async function playSound(message) {
    validateMessage(message);
    if (!player) throw new Error('Audio player is unavailable.');
    // 새 요청이 잘못되었을 때는 정상 재생 중인 소리를 끊지 않는다.
    const source = createSource(message);
    stopPlayback();
    const playback = { blobUrl: source.blobUrl, reject: null, timeout: null };
    currentPlayback = playback;
    try {
      const cancelled = new Promise((resolve, reject) => { playback.reject = reject; });
      playback.timeout = setTimeout(() => {
        if (currentPlayback === playback) stopPlayback(new Error('Audio playback timed out.'));
      }, PLAYBACK_TIMEOUT_MS);
      const started = Promise.resolve().then(() => {
        if (currentPlayback !== playback) throw new Error('Playback was replaced by a newer sound.');
        player.src = source.src;
        player.volume = message.volume / 100;
        return player.play();
      });
      // play()가 정지/교체/디코딩 오류로 끝나지 않아도 응답 채널과 타이머 큐를 영구 점유하지 않는다.
      await Promise.race([started, cancelled]);
      if (currentPlayback !== playback) throw new Error('Playback was replaced by a newer sound.');
      clearTimeout(playback.timeout);
      playback.reject = null;
    } catch (error) {
      if (currentPlayback === playback) stopPlayback(error);
      throw error;
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== 'object' || Array.isArray(message) || message.type !== 'playSound') return false;
    if (!isTrustedSender(sender)) {
      sendResponse({ ok: false, error: 'Untrusted audio message sender.' });
      return false;
    }
    playSound(message).then(
      () => sendResponse({ ok: true }),
      (error) => sendResponse({ ok: false, error: error.message || 'Unable to play audio.' })
    );
    return true;
  });

  // 재생 종료/실패/문서 해제 때 메모리를 반환하고, 오래된 이벤트가 새 재생을 취소하지 않게 한다.
  player?.addEventListener('ended', () => { if (player.ended) stopPlayback(); });
  player?.addEventListener('error', () => {
    if (player.error) stopPlayback(new Error('Audio could not be decoded or loaded.'));
  });
  window.addEventListener('pagehide', () => stopPlayback());
})();
