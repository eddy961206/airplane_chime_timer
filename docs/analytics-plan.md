# Product measurement proposal (not enabled)

## Current behavior in 1.3.7

The extension does not contain an analytics SDK, tracking pixel, remote collection endpoint, persistent analytics identifier, or network permission. Timer settings, custom audio, and the existing review-prompt counters (`installedAt`, `chimeCount`, `lastChimeAt`, review choices) remain in `chrome.storage.local`. The counters are not sent anywhere. The content security policy restricts connections to packaged extension resources.

Chrome Web Store / GA4 listing reports describe visits to the store listing and observed installation events. They do not show whether a person heard a chime, used the timer again, or found the reminder helpful. Do not equate store install requests with successful installations or calculate product retention from listing analytics.

## Recommended first step

Use Chrome Web Store aggregate reports and voluntary feedback to evaluate the improved first-use experience. Keep this release tracking-free. An in-product collection backend, retention policy, and disclosure have not been approved or configured, so adding live telemetry now would make the current privacy promises false.

## If consent-based product analytics is later approved

1. Explain the purpose before collection. Provide equally clear **Share anonymous usage counts** and **Not now** buttons. Default to off, do not block the timer, and do not nag people who decline.
2. Describe exactly what is sent, who receives it, and how long it is kept. A random installation ID is pseudonymous, not necessarily anonymous; do not label identified event streams anonymous.
3. Prefer aggregate daily counts without a persistent ID. Example allowlist: `sound_test_succeeded`, `timer_enabled`, `scheduled_chime_started`, `settings_error`, and coarse timer mode (`single`/`dual`). A media `play()` resolution indicates playback started, not that someone heard it.
4. Never include uploaded audio, filenames, custom labels, browsing URLs/history, account data, exact reminder times, free-form errors, or review text. Do not derive health, work, or personal routines from timer settings.
5. Do not replay events from before consent. Withdrawing consent must immediately stop collection, delete pending local telemetry and analytics identifiers, and explain how to request deletion of any retained server data.
6. Use a documented HTTPS endpoint with a tightly scoped host permission, strict schema/size limits, rate limits, and server-side aggregation. Never ship a GA4 Measurement Protocol API secret or other reusable secret in the extension. Do not connect the product to the store-listing stream as if they were the same funnel.
7. Select and document a short retention period before launch; verify the provider's IP/log handling and deletion behavior. Update the privacy policy, Web Store disclosures, and in-app “No tracking” claims before submission.
8. Add automated tests proving zero requests before consent, no backlog replay, cancellation on opt-out, safe failure while offline, no sensitive event fields, and no timer regressions.

No analytics service or disclosure has been changed as part of this proposal.
