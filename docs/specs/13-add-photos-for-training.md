# Spec 13 — Collect strip photos (camera or library) and send them for training

## Problem
More strip photos are needed to train the region detector (spec 10), especially of strips the scanner fails on.
Friends can take them, but installing the app is easy only on Android (APK link); on iPhone it needs TestFlight
($99/yr developer account) or AltStore (a computer, re-signing every 7 days). Plain photos sent by WhatsApp or email
work for everyone — but on their own they have no label and no scan trace.

## What it does
**Settings → Training photos → "Collect strip photos (camera or library)"** — works like Test scan:

1. **Which medicine is in the next photos?** — pick one of the medicines in the app, type a name and strength
   ("Vonzai" / "20"; "Vonzai 20" in the name field also works), or "Don't know". Stays chosen for the next photos.
2. **Take a photo** (camera) or **From library** (up to 30 at a time — e.g. photos friends sent). Each photo is
   scanned straight away exactly as a live scan is (whole photo, region detector, crops, every way up), so it keeps the
   full scan trace (spec 12: detector boxes, text read at each step, boxed copy). It's saved as a labelled training
   photo (`how: "imported"`) with **`scan`**: *recognised*, *name only* (strength not read) or *not recognised* —
   would the scanner have recognised this strip as the medicine named? "Don't know" saves it unlabelled.
3. The results list (newest first) shows each photo, its medicine, what the scanner made of it and what was read,
   with a summary ("12 photos saved · scanner: 7 recognised, 5 not recognised").
4. **Send for training** — right on this screen (also on Test scan and in Settings).

Photos are saved even if "Save scan photos for training" is off: collecting them is an explicit choice.

## Send for training (fixed)
Opens a ready email to the training address with the zip attached when Apple Mail (iPhone) or a mail app (Android)
is set up. Otherwise — e.g. an iPhone with only the Gmail app, where that screen isn't available and the button used
to stop with "No email account" — it opens the **share sheet** with the zip, titled with the address: pick Gmail (or
Outlook, WhatsApp, Drive) and send. The share sheet can't tell whether it was sent, so the app asks **"Did it send?"**
and marks the photos sent only on *Yes, sent*; a saved draft is treated the same way. Big collections go in parts
under the email size limit. Code: `emailTraining` / `markSent` in `src/training.ts`, `src/sendForTraining.tsx`.

## Naming is optional (v2)
* **Skip — just take photos** is the default. Each photo is saved unlabelled, and the app guesses the medicine from
  what was read (brand and strength, same rules as Scan to add, kept only when the brand is in the built-in list of
  ~3,000 medicines): **"Looks like Nebicard 2.5? Yes / No"**. *Yes* names the saved photo (with auto-labels and
  whether the scanner recognised it); *No* leaves it unlabelled — still useful. `guessFromText`, `labelSavedPhoto`.
* **Type a name** suggests brands from the built-in list as you type; tapping one fills the name and, when the brand
  has one strength, the strength, otherwise offers its strengths as taps. `suggestBrands`.

## File names and phones
Photo files are named `<time>-<n>-<UUID>.jpg` and zips `medsync-training-<date>-<phone>-<UUID>.zip`, so photos from
many phones never clash when merged. Each install makes a random phone id once (`training/phone-id.txt` on the phone);
every manifest entry carries it as `phone`. `src/uid.ts`.

## Sending (v2)
* **Send for training** first asks **Gmail or another app** / **Mail app** when Apple Mail is set up. Mail with a
  Hotmail/Outlook account can leave the email stuck in Mail's Outbox while telling the app it was sent; Gmail through
  the share sheet avoids that. After a share-sheet send the app asks "Did it send?".
* **"Didn't arrive? Send everything again"** (Settings) clears the sent marks so the next send includes all photos.
* The everyday-scan switch is now "Also keep photos from everyday scans": off keeps only photos taken in Collect.

## Asking friends for photos
Message to send (also in the conversation where this was built):
> I'm training my medicine-scanner app and need photos of medicine strips — any medicine, any brand.
> For each strip please send: the back (printed side) flat and filling the photo; the same tilted a little;
> one with the light on it (shiny is fine — the app has to cope); and the expiry/batch area. Torn or half-used strips
> are great too. Please tell me the medicine name and strength with each one (e.g. "Pantodac 40").
> Please keep prescriptions, names, faces and anything personal out of the photo. WhatsApp "as document" or email
> keeps the photo sharper than a normal WhatsApp photo.

Then add each friend's photos one medicine at a time.

## Privacy
Photos of someone's medicines are health information about them. Ask before using them, keep personal details out of
the frame, and don't share the photos further. Imported photos stay on the phone until exported or emailed (spec 03).

## Code
`app/import-photos.tsx` (screen, route `/import-photos`), `src/importPhotos.ts` (pure: `judgeImport`, `parseTypedLabel`, `importSummary`),
`src/training.ts` (`how: "imported"`, `scan`). Tests: `tests/importPhotos.test.ts`.

## Sharing the app with friends who collect
* **Android:** one link always gets the newest build —
  `https://github.com/aronipani/medsync/releases/latest/download/MedSync.apk` (the CI also publishes the APK under this
  fixed name). Open it on the phone, allow installing from that source.
* **iPhone:** needs TestFlight (Apple Developer account, $99/yr; `ios.yml` + spec 08). Until then iPhone friends send
  plain photos, added with "From library".
* A new user with no medicines sees **"Help train the strip scanner → Collect strip photos"** on the Today and Scan tabs,
  so friends don't have to find it in Settings. `medsync://import-photos` opens the screen directly.
* The first time, Collect strip photos shows **"Before you start"**: what is collected, that photos go to the training
  address only when they press Send, to keep personal details out of the frame, to photograph only strips they may
  share, and how to delete photos. Agreeing is stored as `settings.collectConsent` (time).
