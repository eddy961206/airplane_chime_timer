/**
 * @fileoverview Chrome Storage API 래퍼 클래스
 * @author eddy961206
 */

import { DEFAULT_SETTINGS, STORAGE_KEYS, MESSAGE_TYPES } from './constants.js';
import { log } from './utils.js';

/**
 * Chrome Storage API를 래핑한 설정 관리 클래스
 */
export class StorageManager {
  /**
   * 설정값 저장
   * @param {Object} settings - 저장할 설정값들
   * @throws {Error} 저장 실패 시 에러 발생
   */
  static async save(settings) {
    try {
      await chrome.storage.local.set(settings);
      log('info', '설정 저장 완료:', settings);

      // 사운드 관련 설정 변경 시 background script에 알림
      if (settings[STORAGE_KEYS.SELECTED_SOUND] !== undefined ||
          settings[STORAGE_KEYS.VOLUME] !== undefined) {
        chrome.runtime.sendMessage({ type: MESSAGE_TYPES.UPDATE_SOUND }).catch(() => {
          // 메시지 전송 실패는 무시 (background script가 준비되지 않았을 수 있음)
        });
      }
    } catch (error) {
      log('error', '설정 저장 실패:', error);
      throw new Error('Failed to save settings');
    }
  }

  /**
   * 설정값 로드
   * @param {string[]|null} keys - 로드할 키들 (null이면 모든 설정 로드)
   * @returns {Promise<Object>} 로드된 설정값들
   */
  static async load(keys = null) {
    try {
      const result = keys
        ? await chrome.storage.local.get(keys)
        : await chrome.storage.local.get(DEFAULT_SETTINGS);

      // 기본값과 병합
      const settings = { ...DEFAULT_SETTINGS, ...result };
      log('info', '설정 로드 완료:', keys || 'all');

      return settings;
    } catch (error) {
      log('error', '설정 로드 실패:', error);
      return DEFAULT_SETTINGS;
    }
  }

  /**
   * 특정 설정값 가져오기
   * @param {string} key - 설정 키
   * @returns {Promise<any>} 설정값
   */
  static async get(key) {
    try {
      const result = await chrome.storage.local.get(key);
      return result[key] !== undefined ? result[key] : DEFAULT_SETTINGS[key];
    } catch (error) {
      log('error', `설정 로드 실패 (${key}):`, error);
      return DEFAULT_SETTINGS[key];
    }
  }

  /**
   * 특정 설정값 업데이트
   * @param {string} key - 설정 키
   * @param {any} value - 설정값
   */
  static async set(key, value) {
    await this.save({ [key]: value });
  }

  /**
   * 설정값 삭제
   * @param {string|string[]} keys - 삭제할 키(들)
   */
  static async remove(keys) {
    try {
      await chrome.storage.local.remove(keys);
      log('info', '설정 삭제 완료:', keys);
    } catch (error) {
      log('error', '설정 삭제 실패:', error);
      throw new Error('Failed to remove settings');
    }
  }

  /**
   * 모든 설정값 초기화
   */
  static async clear() {
    try {
      await chrome.storage.local.clear();
      log('info', '모든 설정 초기화 완료');
    } catch (error) {
      log('error', '설정 초기화 실패:', error);
      throw new Error('Failed to clear settings');
    }
  }

  /**
   * 설정값 변경 감지 리스너 등록
   * @param {Function} callback - 변경 감지 콜백 (changes, area) => void
   */
  static addChangeListener(callback) {
    const listener = (changes, area) => {
      if (area === 'local') {
        log('info', '스토리지 변경 감지:', changes);
        callback(changes, area);
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return listener; // 나중에 제거할 수 있도록 리스너 반환
  }

  /**
   * 설정값 변경 감지 리스너 제거
   * @param {Function} listener - 제거할 리스너
   */
  static removeChangeListener(listener) {
    chrome.storage.onChanged.removeListener(listener);
  }

  /**
   * 듀얼 타이머 설정 업데이트
   * @param {Object} dualTimerConfig - 듀얼 타이머 설정
   */
  static async updateDualTimer(dualTimerConfig) {
    await this.set(STORAGE_KEYS.DUAL_TIMER, dualTimerConfig);
  }

  /**
   * 커스텀 사운드 추가
   * @param {Object} customSound - 추가할 커스텀 사운드
   */
  static async addCustomSound(customSound) {
    const customSounds = await this.get(STORAGE_KEYS.CUSTOM_SOUNDS) || [];
    customSounds.push(customSound);
    await this.set(STORAGE_KEYS.CUSTOM_SOUNDS, customSounds);
  }

  /**
   * 커스텀 사운드 제거
   * @param {string} soundId - 제거할 사운드 ID
   */
  static async removeCustomSound(soundId) {
    const customSounds = await this.get(STORAGE_KEYS.CUSTOM_SOUNDS) || [];
    const updatedSounds = customSounds.filter(sound => sound.value !== soundId);
    await this.set(STORAGE_KEYS.CUSTOM_SOUNDS, updatedSounds);
  }

  /**
   * 스토리지 사용량 확인
   * @returns {Promise<{used: number, total: number}>} 사용량 정보
   */
  static async getUsage() {
    try {
      const usage = await chrome.storage.local.getBytesInUse();
      return {
        used: usage,
        total: chrome.storage.local.QUOTA_BYTES || 10485760 // 10MB 기본값
      };
    } catch (error) {
      log('error', '스토리지 사용량 확인 실패:', error);
      return { used: 0, total: 0 };
    }
  }

  /**
   * 설정 데이터 내보내기
   * @returns {Promise<Object>} 모든 설정 데이터
   */
  static async exportSettings() {
    try {
      const allData = await chrome.storage.local.get();
      log('info', '설정 데이터 내보내기 완료');
      return allData;
    } catch (error) {
      log('error', '설정 데이터 내보내기 실패:', error);
      throw new Error('Failed to export settings');
    }
  }

  /**
   * 설정 데이터 가져오기
   * @param {Object} data - 가져올 설정 데이터
   */
  static async importSettings(data) {
    try {
      // 유효성 검사
      const validKeys = Object.values(STORAGE_KEYS);
      const filteredData = {};

      for (const [key, value] of Object.entries(data)) {
        if (validKeys.includes(key)) {
          filteredData[key] = value;
        }
      }

      await this.save(filteredData);
      log('info', '설정 데이터 가져오기 완료:', Object.keys(filteredData));
    } catch (error) {
      log('error', '설정 데이터 가져오기 실패:', error);
      throw new Error('Failed to import settings');
    }
  }
}
