# Spec 19 — Reaching Indian families in the US

## Why
Many Indian families in the US manage medicines for parents: parents on long visits with Indian strips, parents in
India watched from the US, and US prescriptions at home. TakeSure reads Indian strips and speaks Hindi and Bengali,
which US apps don't, and now reads US boxes and pharmacy bottles (spec 18).

## How people get it — in order
1. **Beta (now):** an App Store **TestFlight public link** and the Android APK.
   * TestFlight isn't limited by the app's App Store countries: anyone with the link can install it, in any country.
   * Up to 10,000 testers per app; each build runs 90 days, so a new build at least every 2–3 months (the iPhone
     workflow already produces them). The first build for outside testers goes through Apple's beta review.
   * Android: the APK from the GitHub release (the phone must allow installing apps from the browser), or later a
     Play closed-test link.
   * Not for most older people on their own: a family member sets it up on the parent's phone.
2. **App Store, US added (after the beta):** Pricing and Availability → add United States. No new build.
   Answer **No** to Apple's regulated medical device declaration (spec 08), with the reasons below.
3. **Google Play, US added** once the Play listing exists (spec 08: 12 testers for 14 days first).

## Full disclosure instead of a lawyer (for now)
The app says plainly what it is and isn't, everywhere it matters: store listing, first-run notice (version 3),
About & safety, and the TestFlight "What to test" text.
* **What it is:** a reminder and record-keeping aid for medicines a person enters themselves.
* **What it is not:** not a medical device, not reviewed or cleared by the FDA, doesn't diagnose, treat, or decide
  doses; amounts come from the prescription the person enters.
* **The scan:** checks a strip or box against the person's **own list** ("Matches your list"); it can be wrong;
  when in doubt, ask the pharmacist. Medicines read from a US label or the FDA list are drafts a person checks.
* **US medicine list:** from the FDA NDC Directory (public domain), updated monthly; may be out of date.
* **Data:** stays on the phone; no account; optional online features go through the anonymous TakeSure server.
* **FDA position it relies on:** FDA's list of software it does not intend to regulate includes software that keeps
  track of medications and gives user-configured reminders (FDA, "Examples of software functions for which FDA will
  exercise enforcement discretion"). Scanning goes a little beyond plain reminders, which is why the wording above
  never claims to identify a medicine — only to check it against the person's own list.

Disclosure lowers the risk of misunderstanding; it is not legal advice or protection. Before the App Store US listing,
an hour with a US health-app lawyer (or a free university law clinic) is still recommended.

## Built (Oct 2026)
* **Dose-time scanning off in the US** (phone region US, or a US time zone): the Scan tab and Check the strips say so;
  Today offers "I took it" instead of "Scan the strip". Scan to add still works. India: unchanged (on).
* **Turning it back on** (Scan tab or Settings → Scanning at dose time): the disclosure is shown and needs a tick
  ("I have read this and understand it") before the switch works. Anyone can turn it off again.
* **Where the acceptance is kept:** on the phone only, in settings (`doseScan: { on, at, disclosure: version }`), and in
  backups. The disclosure text is versioned in `src/doseScan.ts`; git history shows what each version said and when it
  shipped. Raising the version asks again. Nothing is sent to a server (no accounts; spec 16 stays anonymous).
* **Family members in another time zone** (member screen → Where they live): their doses follow their own clock;
  Today shows "8:30 AM their time · 8:00 PM here"; this phone sets no reminders for them and doesn't mark their doses
  missed (their own phone does). Caregiver alerts ("Ma hasn't taken her 8:30") wait for the family circle (spec 16).

## Before the US beta
* US medicine list built (spec 18) and checked on 5–10 real US boxes and pharmacy bottles.
* Safety notice v3 with the US wording above; About & safety shows the US list's date.
* TestFlight "What to test" text and a one-page setup guide (QR code to the TestFlight link and APK).

## Store listing (when the US is added)
* Subtitle that fits both countries, e.g. "Family medicine reminders".
* Keywords: parents, caregiver, Hindi, Bengali, Indian medicines, pill reminder.
* Screenshots: an Indian strip, a US pharmacy bottle, the spoken Hindi result; family circle once the server runs.

## Reaching people
Temple and community groups and Indian grocery stores (flyer with QR code); Indian-origin doctors in the US (AAPI);
desi parents' WhatsApp and Facebook groups; Indian student and alumni associations. Early reviews matter most.

## What makes it worth it
The family circle (spec 16: taken / missed / low stock, shared with chosen family) — "see that Ma took her medicine
in Kolkata" — needs the TakeSure server deployed. It is the main reason a US family would choose TakeSure.
