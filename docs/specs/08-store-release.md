# Spec 08 — Releasing on the Play Store and App Store (checklist)

Sideloading (APK, AltStore) works for family and testers. To give MedSync to anyone, it needs the stores.

## Accounts and cost
* Google Play Console — one-time US$25. New personal accounts must run a **closed test with at least 12 testers for
  14 days** before production (check the current rule when applying).
* Apple Developer Program — US$99 per year. Needed for any iPhone install beyond 7-day free sideloading.

## Builds
* Android: signed **AAB** (not APK) with an upload key kept safe; Play App Signing on. Add an `eas build` or Gradle
  `bundleRelease` job to CI.
* iPhone: signed build uploaded to App Store Connect (EAS or Xcode on a Mac); TestFlight for testers.
* Put back the push-notification entitlement only if push is ever used (it isn't — reminders are local).

## Store listing requirements
* **Privacy policy URL**: https://github.com/aronipani/medsync/blob/main/PRIVACY.md
* Google **Data safety** form: no data collected or shared; data encrypted in transit — not applicable (none sent);
  users can delete data by uninstalling. Declare camera and notification use.
* Apple **App Privacy** labels: "Data Not Collected". Note ML Kit's usage statistics (Google's own SDK disclosure).
* Health/medical: describe it as a reminder and organisation aid, not diagnosis or treatment. No claims that it
  "verifies" medicines with certainty. Category: Medical (Apple) / Medical or Health & Fitness (Google).
* Exact alarms on Android 14+: justify `SCHEDULE_EXACT_ALARM` / use `USE_EXACT_ALARM` only if eligible — medicine
  reminders are a listed use case; otherwise rely on inexact + the follow-up reminder.
* Screenshots in English, Bengali and Hindi; short description mentions offline, free, no account.

## Before first release
* Specs 01–06 shipped; 07 hidden (no server).
* Medicine list source decided (spec 04).
* Check India's Digital Personal Data Protection rules in force at release (the app stores data only on the phone,
  which keeps obligations light — confirm with a lawyer if offering to the public).
