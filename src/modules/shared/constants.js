/**
 * @fileoverview 애플리케이션 전역 상수 정의
 * @author eddy961206
 */

/**
 * 타이머 모드 상수
 */
export const TIMER_MODES = {
  SINGLE: 'single',
  DUAL: 'dual'
};

/**
 * 메시지 타입 상수
 */
export const MESSAGE_TYPES = {
  TOGGLE_TIMER: 'toggleTimer',
  UPDATE_SOUND: 'updateSound',
  UPDATE_INTERVAL: 'updateInterval',
  UPDATE_ALARM: 'updateAlarm',
  UPDATE_DUAL_TIMER: 'updateDualTimer',
  UPDATE_NEXT_CHIME_TIME: 'updateNextChimeTime',
  PLAY_SOUND: 'playSound',
  PLAYBACK_ERROR: 'playbackError'
};

/**
 * 알람 이름 상수
 */
export const ALARM_NAMES = {
  SINGLE: 'chimeAlarm',
  SHORT_TIMER: 'shortTimer',
  LONG_TIMER: 'longTimer'
};

/**
 * 스토리지 키 상수
 */
export const STORAGE_KEYS = {
  IS_ACTIVE: 'isActive',
  TIMER_MODE: 'timerMode',
  SELECTED_SOUND: 'selectedSound',
  INTERVAL: 'interval',
  VOLUME: 'volume',
  CUSTOM_INTERVAL: 'customInterval',
  SPECIFIC_TIME: 'specificTime',
  REPEAT_DAILY: 'repeatDaily',
  DUAL_TIMER: 'dualTimer',
  CUSTOM_SOUNDS: 'customSounds'
};

/**
 * 기본 설정값
 */
export const DEFAULT_SETTINGS = {
  [STORAGE_KEYS.IS_ACTIVE]: false,
  [STORAGE_KEYS.TIMER_MODE]: TIMER_MODES.SINGLE,
  [STORAGE_KEYS.SELECTED_SOUND]: 'chime1',
  [STORAGE_KEYS.INTERVAL]: 15,
  [STORAGE_KEYS.VOLUME]: 50,
  [STORAGE_KEYS.CUSTOM_INTERVAL]: 15,
  [STORAGE_KEYS.SPECIFIC_TIME]: '',
  [STORAGE_KEYS.REPEAT_DAILY]: false,
  [STORAGE_KEYS.DUAL_TIMER]: {
    shortInterval: 15,
    longInterval: 60,
    shortSound: 'chime1',
    longSound: 'chime2'
  },
  [STORAGE_KEYS.CUSTOM_SOUNDS]: []
};

/**
 * 사운드 관련 상수
 */
export const SOUND_CONFIG = {
  MAX_FILE_SIZE: 1024 * 1024, // 1MB
  ALLOWED_TYPES: ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/ogg'],
  CUSTOM_PREFIX: 'custom_',
  DEFAULT_VOLUME: 50
};

/**
 * UI 관련 상수
 */
export const UI_CONFIG = {
  DEBOUNCE_DELAY: 300,
  ERROR_DISPLAY_TIME: 3000
};

/**
 * Chrome Extension 관련 상수
 */
export const EXTENSION_CONFIG = {
  OFFSCREEN_REASONS: ['AUDIO_PLAYBACK'],
  OFFSCREEN_JUSTIFICATION: 'Playing alarm sound',
  WELCOME_URL: 'welcome.html',
  AUDIO_PLAYER_URL: 'audio-player.html'
};

/**
 * 에러 메시지 상수
 */
export const ERROR_MESSAGES = {
  FILE_TOO_LARGE: 'File size cannot exceed 1MB',
  INVALID_FILE_TYPE: 'Only MP3, WAV, and OGG audio files are supported',
  CUSTOM_SOUND_NOT_FOUND: 'Custom sound not found.',
  SOUND_INFO_NOT_FOUND: 'Sound information not found',
  AUDIO_PLAYBACK_ERROR: 'An error occurred while playing the sound.',
  CUSTOM_SOUND_DELETE_FAILED: 'Failed to delete custom sound',
  TIMER_VALIDATION_SHORT_LONGER: 'Timer 1 interval must be shorter than Timer 2 interval.',
  TIMER_VALIDATION_NOT_MULTIPLE: 'Timer 2 ({0} min) must be a multiple of Timer 1 ({1} min) for proper dual timer operation.',
  SETUP_COMPLETE: 'Setup complete: Timer 1 every {0} minutes, Timer 2 every {1} minutes with priority overlap'
};
