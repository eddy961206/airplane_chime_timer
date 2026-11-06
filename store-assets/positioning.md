# Airplane Chime Timer: store positioning

## Recommended metadata

Use these defaults for the next release. The listing text files contain only the ready-to-paste long descriptions. This document is publishing guidance, not a field to paste into the store.

### English

- Title: **Airplane Chime Timer: Hourly & Custom Reminders**
- Title length: **47 characters**, including spaces and punctuation; limit 75.
- Short description: **Hear airplane-style chimes for hourly reminders, break timers and daily routines. Custom sounds. No popup notifications.**
- Short description length: **120 characters**, including spaces and punctuation; limit 132.
- Long description: `listing-en.txt`.

### Korean

- Localized title: **Airplane Chime Timer: 기내 차임벨·반복 알림 타이머**
- Title length: **38 characters**, including spaces and punctuation; limit 75.
- Localized short description: **익숙한 기내 차임벨로 시간을 알려주는 타이머. 정시·사용자 지정 간격·매일 반복 알림과 나만의 소리를 설정하세요. 팝업 알림이나 사용 추적 없이 작동합니다.**
- Short description length: **87 characters**, including spaces and punctuation; limit 132.
- Long description: `listing-ko.txt`.

Retain the full existing product name at the beginning. The suffix adds the two clearest supported search intents, hourly and custom reminders, without a chain of keywords. The Korean version adds natural local vocabulary while keeping the recognizable product name.

If a store derives the title or summary from the uploaded manifest, the release owner must apply the corresponding metadata there and rebuild the package. These recommendations do not change the manifest. Apply Korean metadata only through supported localization fields or localized manifest resources; do not imply that all timer controls are translated.

## Positioning and search intent

The core promise is **an audible time cue without a popup notification**. The distinctive detail is the familiar airplane-style sound. Lead with that experience, then let shoppers recognize their use case: hourly chimes, break reminders, custom intervals or a daily routine.

- Primary audience: people working or studying in Chrome who want to notice time passing without a visual notification.
- Secondary audience: people who enjoy airplane chimes or want to use their own short reminder sound.
- Useful English phrases appear naturally in relevant sentences: airplane chime, hourly reminder, audio reminder, break reminder, custom interval, daily reminder, dual timers.
- Useful Korean phrases appear in the matching feature context: 기내 차임벨, 정시 알림, 반복 알림, 휴식 알림, 타이머, 사용자 지정 간격.
- Keep the first paragraph readable as a standalone explanation. Put the main use cases before setup details and limitations, while keeping those limitations easy to find.
- Reduce uncertainty with specific controls, a three-step start, local storage and no tracking. Do not add claims about popularity, rankings, health, concentration gains or guaranteed productivity.
- These choices improve clarity and relevance. They are not evidence of higher rankings or a guaranteed increase in installs. No keyword-volume or conversion test has been performed.

## Three promotional screenshot sets

Use the order below. A slash in a suggested headline line break is layout guidance, not literal image text. Keep the actual extension capture dominant and the supporting text short. The English source UI can appear in Korean promotional images; do not relabel it to suggest a translated feature that does not exist.

### 1. Familiar sound, low-friction setup

English headline: **Hear the time. / Keep your flow.**

English subhead: **Airplane-style chimes for your day, without popup notifications.**

Korean headline: **하던 일은 그대로, / 시간은 소리로**

Korean subhead: **팝업 알림 없이, 익숙한 기내 차임벨로 시간을 확인하세요.**

Capture: the actual popup with Single Chime selected, a moderate volume and the sound-test control visible. A setup state with the timer OFF is fine; keep the status legible so it is not mistaken for an active reminder. Show the three-step help if it fits without making the interface too small.

Optional small proof line: **Preview before you start.** / **켜기 전에 미리 들어보세요.**

Purpose: make the sound-based benefit understandable at a glance and show that trying a sound is easy. “Keep your flow” is an invitation to use an audio cue, not a claim that every sound is gentle or that the extension improves concentration.

### 2. Timing and sound you choose

English headline: **Your timing. / Your sound.**

English subhead: **Choose a custom interval or daily reminder. Add your own audio.**

Korean headline: **내 시간에, / 내가 고른 소리로**

Korean subhead: **원하는 간격이나 매일 반복 알림을 설정하고, 나만의 소리도 추가하세요.**

Capture: the actual single-timer popup with a 25-minute custom interval, Timer Active ON and the real next scheduled chime visible. Include the genuine custom-sound control in a second clearly separate crop only if needed. Use clean demonstration data; a sample filename must correspond to a real file imported into the test profile.

Optional small proof line: **Custom audio up to 1 MB.** / **나만의 오디오, 최대 1MB.**

Purpose: let shoppers picture their own routine and preferences. Do not label the 25-minute interval as a full Pomodoro cycle, draw a 25/5 sequence, or imply that interval and specific-time modes run together. The initial chime follows the displayed schedule; do not fabricate a countdown beginning exactly 25 minutes after activation.

### 3. Distinct cues for two intervals

English headline: **Two timers. / One clear cue.**

English subhead: **Give each interval its own sound. When both are due, the longer timer takes priority.**

Korean headline: **두 가지 간격을 / 서로 다른 소리로**

Korean subhead: **알림 시각이 겹치면 긴 간격의 타이머 소리가 우선해요.**

Capture: the actual dual-timer popup with 15-minute and 60-minute intervals, two different selected sounds and both real scheduled times. Show enough of the controls to make this a verifiable feature, rather than an abstract illustration.

Optional small proof line: **15-minute cue + hourly chime.** / **15분 알림 + 정시 차임벨.**

Purpose: explain a distinctive feature with one understandable example. Do not describe the longer cue as inherently louder or stronger; the sounds are user-selected and volume is shared.

## Capture and copy guardrails

- Use real captures from the package being submitted. Legacy `screenshots/scene.html` is a simulated interface and has inaccurate claims such as “reliable,” “exact time” and “always visible”; do not publish it unchanged.
- Aim for one benefit per frame, one headline, one short subhead and at most one optional proof line. Keep every text element readable at store-preview size.
- A suitable consistent canvas is 1280 × 800 where the destination accepts it. Verify current upload requirements in each store before final export. Do not stretch or alter the UI to fit.
- Decorative backgrounds and framed crops are fine. Invented UI, review stars, user counts, award badges, fake notifications or performance charts are not.
- “No popup notifications” refers to reminder delivery. Do not claim “no popups” broadly: the extension has a settings popup and opens a welcome guide.
- Do not call all included sounds gentle. The bundle includes an autopilot-disconnect warning. Preview choice and volume are the supported ways to select a softer cue.
- Chrome must be running and the device awake. No always-on, guaranteed delivery, exact-second timing or safety-critical alarm claims.
- Do not claim a full Korean UI, an automatic 25/5 Pomodoro cycle, task lists, calendar integration, music playback, background-noise masking or health benefits.
- Keep the privacy language aligned with the build: no product analytics, no browsing-history collection, settings and custom audio in Chrome local storage.
- Aircraft and airline logos, third-party endorsement language and unverified sound-license claims do not belong in the assets. The release owner still needs to resolve any bundled-audio redistribution obligations before publishing.
- No keyword blocks, competitor names, repeated synonyms, urgency tactics, fabricated social proof or incentives for ratings.

## Verification basis

Copy was checked against `manifest.json`, `popup.html`, `onboarding.js`, `popup.js`, `background.js`, `audio-player.js`, `sounds/sounds.json`, `docs/analytics-plan.md` and `docs/release-1.3.7.md`. This was a source review, not an audible playback test or store publication verification. Title and short-description counts are exact Unicode character counts, including spaces and punctuation.
