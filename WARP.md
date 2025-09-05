# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

Airplane Chime Timer is a Chrome Extension (Manifest V3) that provides authentic aircraft seatbelt sign notifications at specific intervals. It supports both single timer mode (one sound at regular intervals) and dual timer mode (two different sounds with overlapping intervals where the longer interval takes priority).

## Development Commands

### Chrome Extension Development
```powershell
# Load extension in Chrome (development mode)
# Navigate to chrome://extensions/, enable Developer mode, then click "Load unpacked" and select this directory

# View extension logs
# Open Chrome DevTools > Console while on extension pages
# For background script logs: chrome://extensions/ > Details > Inspect views: background page
```

### File Management
```powershell
# Add new sound files to sounds/ directory
# Update sounds/sounds.json to register new sounds
# Icons should be placed in icons/ directory (16px, 48px, 128px required)
```

## Architecture Overview

### Core Components

**Background Service Worker (`background.js`)**
- Manages alarm scheduling using `chrome.alarms` API
- Handles audio playback through offscreen documents
- Manages extension badge state and storage
- Three main managers: `AudioManager`, `AlarmManager`, `BadgeManager`

**Popup Interface (`popup.js`, `popup.html`, `popup.css`)**
- Main UI for user interaction
- Four key modules: `Settings`, `SoundManager`, `AudioController`, `UIController`
- Handles sound selection, volume control, and timer configuration
- Supports custom sound upload and management

**Offscreen Audio Player (`audio-player.js`, `audio-player.html`)**
- Dedicated audio playback context (required by Manifest V3)
- Handles both default and custom sound playback
- Converts base64 custom sounds to Blob URLs for playback

### Data Flow

1. **Timer Activation**: Popup → Background → Chrome Alarms API
2. **Sound Playback**: Background → Offscreen Document → Audio Element
3. **Settings Management**: All components ↔ Chrome Storage API
4. **Custom Sounds**: File Upload → Base64 Encoding → Chrome Storage → Blob Conversion → Playback

### Storage Schema

Chrome Storage Local contains:
- `isActive`: Boolean - timer on/off state
- `timerMode`: String - 'single' or 'dual' timer mode
- `selectedSound`: String - currently selected sound ID (single mode only)
- `interval`: String - timer interval (15, 30, 60, 'custom', 'specific') (single mode only)
- `volume`: Number - playback volume (0-100)
- `customInterval`: Number - custom interval in minutes (single mode only)
- `specificTime`: String - specific time in HH:MM format (single mode only)
- `repeatDaily`: Boolean - daily repeat for specific time (single mode only)
- `dualTimer`: Object - dual timer configuration:
  - `shortInterval`: Number - shorter timer interval in minutes
  - `longInterval`: Number - longer timer interval in minutes (must be multiple of short)
  - `shortSound`: String - sound ID for short interval timer
  - `longSound`: String - sound ID for long interval timer
- `customSounds`: Array - uploaded custom sound files as base64

### Message Passing System

**Background ↔ Popup Messages:**
- `toggleTimer`: Activate/deactivate timer (works with both single and dual modes)
- `updateSound`: Sound selection changed (single mode only)
- `updateInterval`: Timer interval changed (single mode only)
- `updateAlarm`: Complete alarm configuration update (single mode only)
- `updateDualTimer`: Dual timer configuration update with interval and sound settings

**Background ↔ Offscreen Messages:**
- `playSound`: Trigger audio playback with volume and sound data

### Sound System Architecture

**Default Sounds:**
- Stored in `sounds/` directory as MP3/M4A files
- Metadata in `sounds/sounds.json` with value, name, and filename
- Accessed via `chrome.runtime.getURL()`

**Custom Sounds:**
- Uploaded via file input (1MB limit, audio formats only)
- Converted to base64 and stored in Chrome Storage
- Unique IDs generated with `custom_` prefix + timestamp + random string

## Key Development Patterns

### Modular Design
Each major functionality is encapsulated in its own object/module (AudioManager, SoundManager, DualTimerManager, etc.) with clear responsibilities.

### Dual Timer Logic
- **Interval Validation**: Long interval must be a multiple of short interval
- **Smart Overlap Handling**: When both timers would trigger simultaneously, the long interval sound takes priority
- **Independent Alarm Management**: Two separate Chrome alarms (`shortTimer` and `longTimer`) running concurrently
- **Real-time Validation**: UI provides immediate feedback on timer compatibility

### Error Handling
Comprehensive try-catch blocks with user-friendly English error messages and fallback behaviors throughout the codebase.

### Chrome Extension Best Practices
- Uses Manifest V3 with service worker background script
- Implements proper CSP and minimal permissions
- Follows Chrome's audio playback requirements with offscreen documents
- Manages multiple concurrent alarms efficiently

### jQuery Integration
Heavy use of jQuery for DOM manipulation and event handling, particularly in the popup interface.

## File Structure Context

- `manifest.json`: Extension configuration with permissions and entry points
- `background.js`: Service worker managing alarms and audio
- `popup.*`: Main user interface files
- `audio-player.*`: Offscreen document for audio playback
- `sounds/`: Audio files and metadata
- `icons/`: Extension icons in multiple sizes
- `thirdParty/`: External dependencies (jQuery)
- `welcome.html`: First-run welcome page

## Development Guidelines

### Code Style (from .cursorrules)
- Use descriptive Korean comments for all major functions and logic blocks
- Modular architecture with clear separation of concerns
- jQuery for DOM manipulation and AJAX
- Modern JavaScript features and functional programming patterns
- Comprehensive error handling and logging
- Security-first approach with input validation

### Extension-Specific Considerations
- All audio playback must go through offscreen documents (Manifest V3 requirement)
- Use `chrome.alarms` for scheduling, not `setInterval`
- Implement proper storage management for custom sounds (size limits)
- Handle cross-browser compatibility where possible
