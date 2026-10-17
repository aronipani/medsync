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

## Medical category (App Store) — see docs/store/app-store.md
* Listing text, review notes, age rating and App Privacy answers are written out in `docs/store/app-store.md`, with
  the review guidelines a Medical app is checked against (1.4.1, 1.4.2, 2.1, 2.3, 5.1.1, 5.1.3).
* The app never calculates doses (guideline 1.4.2): amounts come only from what the person entered. Keep it so.
* No accuracy claims: the green result says "Matches your list". Safety notice v2 adds "not a medical device",
  "does not work out doses" and "prescription photos are a draft".
* v1 is offered in **India only**, which also keeps Apple's regulated-medical-device declaration (EU/EEA, UK, US) out
  of scope. Declare **No** per region if those countries are added.

## Store builds (done 17 Oct 2026)
* App id `com.takesure.app` on both platforms (test builds were `com.medsync.family`: back up and restore once).
* `eas.json` production profile: `EXPO_PUBLIC_STORE_BUILD=1` (no training photos, `src/edition.ts`), build numbers
  kept by EAS (`appVersionSource: remote`, `autoIncrement`).
* `app.json`: iOS privacy manifest (required-reason APIs), `ITSAppUsesNonExemptEncryption: false`.
* Icon checked: 1024 × 1024, no transparency.

## Accessibility (done 17 Oct 2026)
* Every tappable row and icon has a button role and a spoken name for VoiceOver.
* The very large headings (46 pt "Take 1 tablet", 30 pt titles) grow at most 1.4× with the phone's text size, so
  they stay on screen at the largest setting; all other text grows freely.

## Phone test before submitting (AltStore build now, TestFlight build after Sunday)
1. Fresh install: safety notice shows (v2 text), accept it.
2. Back up in the old MedSync/DoseSure test app, restore in TakeSure; medicines, history and stock all there.
3. Add a medicine with a dose 3 minutes ahead; the reminder arrives with Scan now and Snooze, then "Not taken yet".
4. Scan the right strip: green "Matches your list", amount spoken. Scan another strip: red, "scan the next one".
5. I took it: Today shows taken, Stock goes down by the amount.
6. Prescription photo: opens as a draft to check; nothing is saved until you save.
7. Deny camera, then notifications: the app explains how to turn them on and doesn't crash.
8. Airplane mode: everything above still works.
9. Settings → Text size at the largest, VoiceOver on: Today and Scan readable, every button announced.
10. Report a problem opens an email; About & safety opens the privacy policy.

## Before first release
* Specs 01–06 shipped; 07 hidden (no server).
* Medicine list source decided (spec 04).
* Check India's Digital Personal Data Protection rules in force at release (the app stores data only on the phone,
  which keeps obligations light — confirm with a lawyer if offering to the public).
