# Spec 11 — Test scan (readiness check before the reminder)

## Problem
The first time a strip is scanned is usually at dose time, with the person waiting to take the medicine. If the
camera isn't allowed, reminders are off, or a strip isn't recognised (glare, new pack design, wrong strength saved),
that's the worst moment to find out.

## What it does
**Test scan** screen (Scan tab when nothing is due → "Try the next strips" or "Try the strips for 8:00 AM" (a quiet button: "A practice before it's time. Nothing is recorded."); Settings → Scanning → Before a first dose → **Check the strips**):

1. **Ready for the next dose?** — camera allowed, reminders (notifications) allowed and the next dose time, which
   text reader this build uses, and whether the region detector is loaded.
2. **Medicines due in the next 24 hours** — each one, soonest first, with its last test: *Ready*, *Strength not read
   last time*, *Last test failed*, *Not tested yet*, or *Tested over a month ago* (a test counts for 30 days).
3. **Test scan** — the same reading as the Scan tab (photo, every-way-up reading, region detector, glare retry with
   two more photos), but checked against **every active medicine**, not just those due. The result says what the
   real scan would show at dose time: green, "check the strength", red with a different strength, red because it
   looks like another medicine, or not recognised. Also the expiry read, the text read, the time taken, the reader and
   what the region detector did.
4. **"Is this strip X?"** — *Yes* keeps the photos as labelled training photos (also when only the strength was
   missed, or a different strength was read: those are the hard examples). *No* marks the test failed and asks
   **"Which medicine is it?"**.
5. **Not recognised, or wrong** — "Which medicine is it?" lists the medicines due soonest first, then the rest.
   Picking one keeps the photos labelled with it (the most useful training photos: the scanner failed and the
   answer is known) and marks that medicine's test failed. "None of these" keeps them unlabelled.

Every test's photos are kept exactly once when training photos are on (Settings → Your data → Photos for improving the scanner): labelled when
the medicine is known, otherwise unlabelled with what the test read — including when the person leaves or starts
the next test without answering. They go out with Export or Send for training like other training photos. Each carries the scan's trace (spec 12): the detector's boxes and the text read at each step, plus a copy of the photo with the boxes drawn on it.

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
unknown; inactive medicines ignored; reminders (timing, skipped passes, reasons, expiry by dose time, off at 0, names with several people); records per outcome; readiness states including stale after 30 days; upcoming
list in the next 24 hours soonest first, including tomorrow morning when it's late evening.

## "Test-scan first" reminder
For each dose time in the next 48 hours, if any medicine in it hasn't passed a test scan that will still count at
dose time (untested, failed, strength not read, or over a month old by then), one notification
**"🧪 Test-scan before the 8:00 AM dose"** comes `testReminderMin` minutes before (default 60; Settings →
"Test-scan reminder (min before)", 0 = off). It lists those medicines and why, e.g. "Ma: Clopilet 75 — not tested yet".
Tapping it opens Test scan. Reminders whose time has passed are skipped. They're rebuilt with the other reminders,
and again after every test scan, so a pass removes its reminder and a failure adds one. Capped so dose reminders and
"not taken yet" follow-ups always fit in iOS's 64 pending notifications.

Code: `testReminders` in `src/testScan.ts` (pure, tested); scheduled in `src/notifications.ts`.

## Reminders only when scanning is on (24 Oct 2026)
* "Check the strips" reminders are set only when dose-time scanning is on (off by default in the US, spec 19), and
  skip people who live in another time zone.
