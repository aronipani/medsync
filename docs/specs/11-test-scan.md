# Spec 11 — Test scan (readiness check before the reminder)

## Problem
The first time a strip is scanned is usually at dose time, with the person waiting to take the medicine. If the
camera isn't allowed, reminders are off, or a strip isn't recognised (glare, new pack design, wrong strength saved),
that's the worst moment to find out.

## What it does
**Test scan** screen (Scan tab when nothing is due → "Test scan (nothing is logged)"; Settings → Strip reading → Test scan):

1. **Ready for the next dose?** — camera allowed, reminders (notifications) allowed and the next dose time, which
   text reader this build uses, and whether the region detector is loaded.
2. **Medicines due in the next 24 hours** — each one, soonest first, with its last test: *Ready*, *Strength not read
   last time*, *Last test failed*, *Not tested yet*, or *Tested over a month ago* (a test counts for 30 days).
3. **Test scan** — the same reading as the Scan tab (photo, every-way-up reading, region detector, glare retry with
   two more photos), but checked against **every active medicine**, not just those due. The result says what the
   real scan would show at dose time: green, "check the strength", red with a different strength, red because it
   looks like another medicine, or not recognised. Also the expiry read, the text read, the time taken, the reader and
   what the region detector did.
4. **"Is this strip X?"** — *Yes* keeps the photos as labelled training photos (if training photos are on);
   *No* marks the test failed and keeps the photos unlabelled with the reason.

Nothing is logged, stock doesn't change, and the app learns nothing (no "teach") from a test scan.
The Scan tab shows "N of M medicines for the next 24 hours tested" when nothing is due.

## Storage
Last result per medicine in AsyncStorage (`medsync.testScans.v1`): time, ok / check / failed, seconds, reader,
detector. Not in backups — it describes this phone's camera and reader, not the schedule.

## Code
* `src/testScan.ts` (pure): `classifyTest`, `recordFor`, `upcomingReadiness`, `readinessOf`, `readinessSummary`.
* `src/testScanStore.ts`: load / save records. `app/test-scan.tsx`: the screen.

## Tests
`tests/testScan.test.ts`: any household medicine is recognised (not only due ones); name-only, other strength and
unknown; inactive medicines ignored; records per outcome; readiness states including stale after 30 days; upcoming
list in the next 24 hours soonest first, including tomorrow morning when it's late evening.

## Later
* A "Test before the next dose" reminder an hour before a dose whose medicine is untested or failed.
