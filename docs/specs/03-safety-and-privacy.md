# Spec 03 — Safety notice and privacy

## Problem
MedSync checks medicine strips by reading text. It can be wrong (glare, torn foil, look-alike brands), and the
built-in medicine list is small. People giving it to elderly parents need to know what it can and cannot do, and
what happens to their health data. App stores require a privacy policy for health apps.

## Goal
1. A short, plain first-run notice that a person must accept once (and again only if the wording materially changes).
2. A permanent **About & safety** page in Settings with the full text.
3. A public privacy policy (`PRIVACY.md` in the repo; its GitHub URL is the store "privacy policy URL").
4. The text is truthful about where data goes — nothing more is claimed than the app actually does.

## First-run notice ("Before you start")
Shown full-screen on first launch, before anything else, until **I understand** is tapped.
Stored as `settings.acceptedNotice = NOTICE_VERSION` (currently 2: adds not-a-medical-device, doses come from the prescription, prescription drafts). Raising `NOTICE_VERSION` shows it again.

Content (short):
* **MedSync helps you remember and check — it does not replace your doctor or pharmacist.**
* The scanner can be wrong. Always read the name and strength on the strip yourself before taking it.
* Follow your prescription. Never change, stop or double a medicine because of the app — ask your doctor.
* "Same medicine" warnings only cover medicines in the app's list; no warning does not mean it is safe.
* In an emergency, call your doctor or emergency services (112 in India).
* **Your data stays on this phone.** No account, no ads, no tracking. Nothing is uploaded unless you share it yourself.

## About & safety page
Settings → **About & safety**: the notice points in full, a "What stays on your phone" section, the privacy policy
summary, app version, and a link to the public privacy policy and to report a problem (GitHub issues).

## Truthful data statement (applies to both)
* Medicines, schedules, history, photos: stored only on the phone.
* Reading text from photos: done on the phone (Google ML Kit, on-device model). Google's ML Kit may send
  anonymous usage and performance statistics to Google; it does not send the photos.
* Spoken announcements: the phone's own text-to-speech voices.
* Reminders: scheduled on the phone (no push server).
* Leaves the phone only when the person chooses: a backup file they share, a training-photo export they share.
* Future photo sharing (spec 07) will be opt-in, per photo, and described here before it ships.

## Scan result reminder
Under every green "matches" result: "Check the name on the strip too." (one short grey line).

## Tests
`tests/legal.test.ts`: the notice is required when never accepted or accepted at an older version, not otherwise;
the data statement mentions every place data can leave the phone (backup, training export).
