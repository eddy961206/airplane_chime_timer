# Store presentation review for 1.3.7

Draft only. Do not upload or publish until the actual release package has passed Chrome smoke tests and the owner has approved submission.

- Title: Airplane Chime Timer (unchanged).
- Short description: Audio reminders with airplane chimes: hourly, custom intervals, daily alarms, and dual timers. No popup notifications.
- Long descriptions: `listing-en.txt` and `listing-ko.txt`.
- Positioning: familiar chime sounds, gentle reminders with a chosen sound/volume, clear setup. Do not promise that every bundled sound is gentle: an autopilot-disconnect warning is included.
- Do not claim an automatic Pomodoro work/break cycle, guaranteed sleep-mode alarms, notifications, or second-precise scheduling.
- Retain local-only privacy disclosure. No analytics SDK or collection endpoint has been added.

## Screenshots to capture from the verified build

Existing `screenshots/sc1.png`–`sc3.png` and `scene.html` are legacy assets, not evidence of the new runtime. Replace them with real UI captures before submission rather than publishing a simulated timer screen.

1. **Choose, test, then turn on**: Single Chime at moderate volume, timer OFF, visible test button and three-step help. Caption: “Hear your chime before you start.”
2. **Gentle cues for your routine**: 25-minute custom interval, timer ON, actual scheduled time visible. Caption: “Set an interval that fits your day.” Do not show a 25/5 cycle.
3. **Two sounds, one clear reminder**: dual 15/60-minute configuration, both actual next times visible. Caption: “The longer timer takes priority when chimes coincide.”

Use clean test data and no personal filenames or contact information beyond the existing public support address. Capture at a supported Web Store screenshot size, inspect text legibility, and check every displayed claim against the installed build. The actual extension UI is English with bilingual setup/status guidance; do not imply full UI translation.
