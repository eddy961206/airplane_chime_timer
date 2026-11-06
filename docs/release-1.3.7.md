# 1.3.7 release candidate

## Changes

- Treat custom sound names as plain text in the sound list and dropdowns.
- Replace the generated popup bundle with readable, dependency-free runtime code. Preserve single/dual timers, built-in/custom sounds, volume, reviews, and English/Korean setup guidance.
- Save timing settings through one serialized path. Closing the popup no longer saves hidden settings or resets the next reminder.
- Initialize custom interval, specific time, and daily-repeat controls consistently. Invalid time/interval combinations show an inline message and preserve the previous schedule.
- Restore missing alarms when the popup opens without resetting a valid existing schedule.
- Wire the Add Custom Sound button, reset file selection after an upload, generate collision-resistant sound IDs, and repair all timer references when a sound is deleted.
- Cancel older previews and ignore their stale completion/error messages.
- Validate extension messages, local audio data, intervals, and playback acknowledgments. Count a scheduled chime only after playback starts successfully.
- Restrict extension CSP network access to local packaged resources and remove unused bundles/screenshots from the distribution ZIP.
- Keep product analytics off. The separate measurement proposal requires consent and accurate disclosures before any future collection.

## Approval and verification boundary

This is a source/release candidate, not a Chrome Web Store submission. It must not be described as published. Review the listing, privacy wording, screenshots, and any audio-license obligations before store submission. Included sound filenames mention third-party sound sources; repository presence alone does not establish redistribution rights.

Run the Node regression suite and package script. The Node tests simulate Chrome/DOM/audio APIs; they do not prove audible output or full Chrome integration. A final real-Chrome smoke test must cover the following:

- Clean install, welcome guide in both languages, OFF setup, selection, audible test at nonzero volume, mute, and opening/closing the popup.
- Built-in and custom MP3/WAV playback, empty MIME metadata, malicious-looking filename rendered literally, upload cancellation, repeated upload, and deleting a sound used by both timers.
- Single interval, 25-minute custom interval, one-shot completion, daily time, dual overlap, rapid ON/OFF, and invalid/blank time validation.
- Popup reopened while active, service-worker restart, browser restart, system sleep/wake, and no duplicate sounds or unintended rescheduling.
- No external requests from the extension. Actual next alarm shown in the popup. CSP produces no unexpected console errors.

Sleep/closed-browser delivery and exact second timing are not guaranteed. A 25-minute interval does not implement an automatic 25/5 Pomodoro cycle.

## Optional browser test runner

Install development-only browser test dependencies on an isolated runner:

```sh
npm ci --ignore-scripts
npx playwright install chromium
npm run test:browser
```

To use an already installed extension-capable Chromium instead:

```sh
CHROME_BIN=/path/to/chromium node scripts/browser-smoke.cjs
```

It uses a new temporary profile, verifies actual extension/DOM integration, and writes screenshots into ignored `test-results/`. Set `HEADED=1` for a visible window. It never reads an existing personal browser profile. Review the captures before using them as store assets. Playback startup checks do not replace listening or sleep/wake QA.
