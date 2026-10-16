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

## Later
* "Contribute photos" mode for friends who install the app (Android APK / TestFlight): photograph any strip without a
  schedule, name it, consent screen, Send for training.
