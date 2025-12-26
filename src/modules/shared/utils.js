/**
 * @fileoverview 공통 유틸리티 함수 모음
 * @author eddy961206
 */

import { ERROR_MESSAGES } from './constants.js';

/**
 * 디바운스 함수
 * @param {Function} func - 실행할 함수
 * @param {number} wait - 대기 시간 (밀리초)
 * @returns {Function} 디바운스된 함수
 */
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * 문자열 포맷팅 함수 (플레이스홀더 {0}, {1} 등을 값으로 치환)
 * @param {string} str - 포맷팅할 문자열
 * @param {...any} args - 치환할 값들
 * @returns {string} 포맷팅된 문자열
 */
export const formatString = (str, ...args) => {
  return str.replace(/{(\d+)}/g, (match, number) => {
    return typeof args[number] !== 'undefined' ? args[number] : match;
  });
};

/**
 * 시간을 로케일에 맞게 포맷팅
 * @param {Date} date - 포맷팅할 날짜 객체
 * @returns {string} 포맷팅된 시간 문자열 (HH:MM)
 */
export const formatTime = (date) => {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

/**
 * 파일을 Base64로 변환
 * @param {File} file - 변환할 파일
 * @returns {Promise<string>} Base64 문자열
 */
export const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
};

/**
 * Base64 문자열을 Blob URL로 변환
 * @param {string} base64Data - Base64 데이터
 * @param {string} mimeType - MIME 타입
 * @returns {string} Blob URL
 */
export const base64ToBlobUrl = (base64Data, mimeType = 'audio/mpeg') => {
  const base64 = base64Data.split(',')[1];
  const byteCharacters = atob(base64);
  const byteArray = new Uint8Array(byteCharacters.length);

  for (let i = 0; i < byteCharacters.length; i++) {
    byteArray[i] = byteCharacters.charCodeAt(i);
  }

  const blob = new Blob([byteArray], { type: mimeType });
  return URL.createObjectURL(blob);
};

/**
 * 에러 메시지를 사용자에게 표시
 * @param {string} message - 표시할 메시지
 * @param {number} duration - 표시 시간 (밀리초)
 */
export const showError = (message, duration = 3000) => {
  // DOM 환경에서만 실행
  if (typeof document === 'undefined') {
    console.error(message);
    return;
  }

  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';
  errorDiv.textContent = message;
  errorDiv.style.cssText = `
    position: fixed;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    background: #f44336;
    color: white;
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 1000;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  `;

  document.body.appendChild(errorDiv);

  setTimeout(() => {
    if (errorDiv.parentNode) {
      errorDiv.parentNode.removeChild(errorDiv);
    }
  }, duration);
};

/**
 * 두 주기가 호환되는지 확인 (긴 주기가 짧은 주기의 배수인지)
 * @param {number} shortInterval - 짧은 주기
 * @param {number} longInterval - 긴 주기
 * @returns {{valid: boolean, message: string}} 검증 결과
 */
export const validateDualTimerIntervals = (shortInterval, longInterval) => {
  const short = parseInt(shortInterval);
  const long = parseInt(longInterval);

  // 기본 유효성 검사
  if (short >= long) {
    return {
      valid: false,
      message: ERROR_MESSAGES.TIMER_VALIDATION_SHORT_LONGER
    };
  }

  // 겹치는 주기 검사
  const isCompatible = (long % short === 0);

  if (!isCompatible) {
    return {
      valid: false,
      message: formatString(ERROR_MESSAGES.TIMER_VALIDATION_NOT_MULTIPLE, long, short)
    };
  }

  return {
    valid: true,
    message: formatString(ERROR_MESSAGES.SETUP_COMPLETE, short, long)
  };
};

/**
 * 다음 알람 시간 계산 (단일 타이머용)
 * @param {string} interval - 인터벌 설정
 * @param {string} specificTimeValue - 특정 시간 설정
 * @param {string} customIntervalValue - 커스텀 인터벌 설정
 * @returns {string} 포맷팅된 다음 알람 시간
 */
export const calculateNextChimeTime = (interval, specificTimeValue, customIntervalValue) => {
  const now = new Date();
  let nextTime = null;

  if (!interval) return '--:--';

  if (interval === 'specific' && specificTimeValue) {
    const [hours, minutes] = specificTimeValue.split(':').map(Number);
    nextTime = new Date(now);
    nextTime.setHours(hours, minutes, 0, 0);

    if (nextTime <= now) {
      nextTime.setDate(nextTime.getDate() + 1);
    }
  } else if (interval === 'custom') {
    const customInterval = parseInt(customIntervalValue) || 15;
    nextTime = new Date(now.getTime() + customInterval * 60000);
    nextTime.setSeconds(0, 0);
  } else {
    const intervalMinutes = parseInt(interval) || 15;
    const minutesToAdd = intervalMinutes - (now.getMinutes() % intervalMinutes);
    nextTime = new Date(now.getTime() + minutesToAdd * 60000);
    nextTime.setSeconds(0, 0);
  }

  return nextTime ? formatTime(nextTime) : '--:--';
};

/**
 * 다음 알람 시간 계산 (듀얼 타이머용)
 * @param {number} shortInterval - 짧은 주기
 * @param {number} longInterval - 긴 주기
 * @returns {string} 포맷팅된 다음 알람 시간과 타이머 타입
 */
export const calculateDualTimerNextChime = (shortInterval, longInterval) => {
  const now = new Date();
  const currentMinutes = now.getMinutes();
  const currentSeconds = now.getSeconds();

  const short = parseInt(shortInterval);
  const long = parseInt(longInterval);

  // 짧은 주기 다음 알람 시간 계산
  const shortNextMinutes = Math.ceil(currentMinutes / short) * short;
  let shortDelayExact = shortNextMinutes - currentMinutes - (currentSeconds / 60);
  if (shortDelayExact <= 0) {
    shortDelayExact += short;
  }
  const shortNextTime = new Date(now.getTime() + shortDelayExact * 60000);
  shortNextTime.setSeconds(0, 0);

  // 긴 주기 다음 알람 시간 계산
  const longNextMinutes = Math.ceil(currentMinutes / long) * long;
  let longDelayExact = longNextMinutes - currentMinutes - (currentSeconds / 60);
  if (longDelayExact <= 0) {
    longDelayExact += long;
  }
  const longNextTime = new Date(now.getTime() + longDelayExact * 60000);
  longNextTime.setSeconds(0, 0);

  // 두 시간 중 더 빠른 시간 선택
  const nextTime = shortNextTime <= longNextTime ? shortNextTime : longNextTime;

  // 겹치는 시간인지 확인해서 정보 추가
  const nextMinutes = nextTime.getMinutes();
  const isOverlapTime = (nextMinutes % long === 0);
  const soundType = isOverlapTime ? 'Timer 2' : (nextTime.getTime() === shortNextTime.getTime() ? 'Timer 1' : 'Timer 2');

  const timeString = formatTime(nextTime);
  return `${timeString} (${soundType})`;
};

/**
 * 로그 출력 유틸리티 (개발/프로덕션 환경 구분)
 * @param {string} level - 로그 레벨 (info, warn, error)
 * @param {string} message - 로그 메시지
 * @param {...any} args - 추가 인자들
 */
export const log = (level, message, ...args) => {
  // 프로덕션 환경에서는 error만 출력
  const env = typeof globalThis !== 'undefined'
    ? globalThis.process?.env?.NODE_ENV
    : undefined;
  if (env === 'production' && level !== 'error') {
    return;
  }

  const timestamp = new Date().toISOString();
  const formattedMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

  switch (level) {
  case 'error':
    console.error(formattedMessage, ...args);
    break;
  case 'warn':
    console.warn(formattedMessage, ...args);
    break;
  default:
    console.log(formattedMessage, ...args);
  }
};
