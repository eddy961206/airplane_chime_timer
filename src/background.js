/**
 * @fileoverview Background script entry point
 * @author eddy961206
 */

import { AudioManager } from './modules/background/AudioManager.js';
import { MessageHandler } from './modules/background/MessageHandler.js';
import { log } from './modules/shared/utils.js';

/**
 * Background script initialization
 */
async function initialize() {
  try {
    await AudioManager.createOffscreenDocument();
    log('info', 'Background script 초기화 완료');
  } catch (error) {
    log('error', 'Background script 초기화 실패:', error);
  }
}

// Extension lifecycle events
chrome.runtime.onInstalled.addListener(MessageHandler.handleInstalled);
chrome.runtime.onStartup.addListener(MessageHandler.handleStartup);
chrome.runtime.onMessage.addListener(MessageHandler.handleMessage);
chrome.alarms.onAlarm.addListener(MessageHandler.handleAlarm);

// Initialize when script loads
initialize();
