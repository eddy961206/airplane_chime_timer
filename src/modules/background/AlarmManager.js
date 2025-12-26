/**
 * @fileoverview 알람 관리 모듈
 * @author eddy961206
 */

import { ALARM_NAMES } from '../shared/constants.js';
import { log } from '../shared/utils.js';

/**
 * Chrome Alarms API를 관리하는 클래스
 */
export class AlarmManager {
  /**
   * 단일 타이머 알람 생성
   * @param {Object} settings - 알람 설정
   */
  static async createSingleAlarm(settings) {
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

      await chrome.alarms.create(ALARM_NAMES.SINGLE, {
        when: nextAlarmTime.getTime(),
        periodInMinutes: repeatDaily ? 24 * 60 : undefined
      });
    } else if (interval === 'custom') {
      // 커스텀 인터벌
      const customIntervalMinutes = Math.max(1, parseInt(customInterval) || 15);
      const nextMinutes = Math.ceil(minutes / customIntervalMinutes) * customIntervalMinutes;
      let delayMinutesExact = nextMinutes - minutes - (seconds / 60);
      if (delayMinutesExact <= 0) {
        delayMinutesExact += customIntervalMinutes;
      }

      nextAlarmTime = new Date(now.getTime() + delayMinutesExact * 60000);
      nextAlarmTime.setSeconds(0, 0);

      await chrome.alarms.create(ALARM_NAMES.SINGLE, {
        delayInMinutes: delayMinutesExact,
        periodInMinutes: customIntervalMinutes
      });
    } else {
      // 일반 인터벌
      const intervalMinutes = Math.max(1, parseInt(interval) || 15);
      const nextMinutes = Math.ceil(minutes / intervalMinutes) * intervalMinutes;
      let delayMinutesExact = nextMinutes - minutes - (seconds / 60);
      if (delayMinutesExact <= 0) {
        delayMinutesExact += intervalMinutes;
      }

      nextAlarmTime = new Date(now.getTime() + delayMinutesExact * 60000);
      nextAlarmTime.setSeconds(0, 0);

      await chrome.alarms.create(ALARM_NAMES.SINGLE, {
        delayInMinutes: delayMinutesExact,
        periodInMinutes: intervalMinutes
      });
    }

    log('info', '단일 알람 생성 완료:', settings, '다음 알람 시간:', nextAlarmTime?.toLocaleString());
  }

  /**
   * 듀얼 타이머 알람 생성
   * @param {Object} dualTimer - 듀얼 타이머 설정
   */
  static async createDualAlarm(dualTimer) {
    const { shortInterval, longInterval } = dualTimer;

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

    await chrome.alarms.create(ALARM_NAMES.SHORT_TIMER, {
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

    await chrome.alarms.create(ALARM_NAMES.LONG_TIMER, {
      delayInMinutes: longDelayExact,
      periodInMinutes: longIntervalMinutes
    });

    log('info', '듀얼 타이머 알람 생성 완료:', {
      shortInterval: shortIntervalMinutes,
      longInterval: longIntervalMinutes,
      shortDelay: shortDelayExact,
      longDelay: longDelayExact
    });
  }

  /**
   * 모든 알람 제거
   */
  static async clearAllAlarms() {
    await chrome.alarms.clearAll();
    log('info', '모든 알람 제거 완료');
  }

  /**
   * 특정 알람 제거
   * @param {string} alarmName - 제거할 알람 이름
   */
  static async clearAlarm(alarmName) {
    await chrome.alarms.clear(alarmName);
    log('info', `알람 제거 완료: ${alarmName}`);
  }

  /**
   * 알람 목록 조회
   * @returns {Promise<chrome.alarms.Alarm[]>} 알람 목록
   */
  static async getAllAlarms() {
    const alarms = await chrome.alarms.getAll();
    log('info', '알람 목록 조회:', alarms);
    return alarms;
  }

  /**
   * 특정 알람 조회
   * @param {string} alarmName - 알람 이름
   * @returns {Promise<chrome.alarms.Alarm|undefined>} 알람 정보
   */
  static async getAlarm(alarmName) {
    const alarm = await chrome.alarms.get(alarmName);
    log('info', `알람 조회 (${alarmName}):`, alarm);
    return alarm;
  }
}
