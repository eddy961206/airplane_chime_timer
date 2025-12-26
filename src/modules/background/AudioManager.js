/**
 * @fileoverview 오디오 재생 관리 모듈
 * @author eddy961206
 */

import { EXTENSION_CONFIG, MESSAGE_TYPES, SOUND_CONFIG } from '@shared/constants.js';
import { log } from '@shared/utils.js';
import { StorageManager } from '@shared/storage.js';

/**
 * 오디오 재생을 관리하는 클래스
 * Manifest V3에서 오프스크린 문서를 통해 오디오를 재생
 */
export class AudioManager {
  /**
   * 오프스크린 문서 생성
   * @throws {Error} 오프스크린 문서 생성 실패 시
   */
  static async createOffscreenDocument() {
    try {
      // 이미 오프스크린 문서가 존재하는지 확인
      if (await chrome.offscreen.hasDocument()) {
        log('info', '오프스크린 문서가 이미 존재함');
        return;
      }

      await chrome.offscreen.createDocument({
        url: EXTENSION_CONFIG.AUDIO_PLAYER_URL,
        reasons: EXTENSION_CONFIG.OFFSCREEN_REASONS,
        justification: EXTENSION_CONFIG.OFFSCREEN_JUSTIFICATION
      });

      log('info', '오프스크린 문서 생성 완료');
    } catch (error) {
      log('error', '오프스크린 문서 생성 실패:', error);
      throw error;
    }
  }

  /**
   * sounds.json에서 사운드 정보 가져오기
   * @param {string} soundName - 사운드 이름
   * @returns {Promise<Object|null>} 사운드 정보 객체
   */
  static async getSoundInfoFromJson(soundName) {
    try {
      const response = await fetch(chrome.runtime.getURL('sounds/sounds.json'));
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const soundInfo = data.sounds.find(sound => sound.value === soundName);

      log('info', `사운드 정보 로드: ${soundName}`, soundInfo);
      return soundInfo;
    } catch (error) {
      log('error', 'sounds.json 로드 실패:', error);
      return null;
    }
  }

  /**
   * 사운드 재생
   * @param {string} soundName - 재생할 사운드 이름
   * @param {number} volume - 볼륨 (0-100)
   */
  static async playSound(soundName, volume = SOUND_CONFIG.DEFAULT_VOLUME) {
    try {
      await this.createOffscreenDocument();

      const soundData = await this.prepareSoundData(soundName);
      if (!soundData) {
        throw new Error(`사운드 데이터를 준비할 수 없습니다: ${soundName}`);
      }

      // 볼륨 값 검증 및 정규화
      const normalizedVolume = Math.max(0, Math.min(100, volume || SOUND_CONFIG.DEFAULT_VOLUME));

      // 오프스크린 문서에 사운드 재생 요청
      await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.PLAY_SOUND,
        ...soundData,
        volume: normalizedVolume
      });

      log('info', '사운드 재생 요청 완료:', { soundName, volume: normalizedVolume });

    } catch (error) {
      log('error', '사운드 재생 오류:', error);
      this.handlePlaybackError(error);
    }
  }

  /**
   * 사운드 데이터 준비 (기본 사운드 또는 커스텀 사운드)
   * @param {string} soundName - 사운드 이름
   * @returns {Promise<Object|null>} 사운드 데이터
   */
  static async prepareSoundData(soundName) {
    if (soundName.startsWith(SOUND_CONFIG.CUSTOM_PREFIX)) {
      return await this.prepareCustomSoundData(soundName);
    } else {
      return await this.prepareDefaultSoundData(soundName);
    }
  }

  /**
   * 커스텀 사운드 데이터 준비
   * @param {string} soundName - 커스텀 사운드 이름
   * @returns {Promise<Object|null>} 커스텀 사운드 데이터
   */
  static async prepareCustomSoundData(soundName) {
    try {
      const customSounds = await StorageManager.get('customSounds') || [];
      const customSound = customSounds.find(sound => sound.value === soundName);

      if (!customSound) {
        throw new Error('커스텀 사운드를 찾을 수 없습니다.');
      }

      return {
        soundUrl: customSound.data,
        filename: customSound.filename,
        isCustomSound: true
      };
    } catch (error) {
      log('error', '커스텀 사운드 데이터 준비 실패:', error);
      return null;
    }
  }

  /**
   * 기본 사운드 데이터 준비
   * @param {string} soundName - 기본 사운드 이름
   * @returns {Promise<Object|null>} 기본 사운드 데이터
   */
  static async prepareDefaultSoundData(soundName) {
    try {
      const soundInfo = await this.getSoundInfoFromJson(soundName);
      if (!soundInfo) {
        throw new Error(`기본 사운드 정보를 찾을 수 없습니다: ${soundName}`);
      }

      return {
        soundUrl: chrome.runtime.getURL(`sounds/${soundInfo.filename}`),
        filename: soundInfo.filename,
        isCustomSound: false
      };
    } catch (error) {
      log('error', '기본 사운드 데이터 준비 실패:', error);
      return null;
    }
  }

  /**
   * 재생 에러 처리
   * @param {Error} error - 발생한 에러
   */
  static handlePlaybackError(error) {
    log('error', '재생 에러 처리:', error.message);

    // 사용자에게 에러 알림 전송 (popup이 열려있는 경우)
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.PLAYBACK_ERROR,
      error: error.message
    }).catch(() => {
      // 메시지 전송 실패 시 무시 (popup이 닫혀있을 수 있음)
      log('info', 'popup이 닫혀있어서 에러 메시지 전송 불가');
    });
  }

  /**
   * 오프스크린 문서 정리
   */
  static async cleanup() {
    try {
      if (await chrome.offscreen.hasDocument()) {
        await chrome.offscreen.closeDocument();
        log('info', '오프스크린 문서 정리 완료');
      }
    } catch (error) {
      log('error', '오프스크린 문서 정리 실패:', error);
    }
  }
}
