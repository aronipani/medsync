# Spec 20 — Send one person's medicines to another phone

## Why
Most users are in India; their caregiver can be anywhere (often the US). Each phone keeps its own data and nothing
syncs. A full backup replaces everything on the phone that opens it, so it can't be used to pass one person back and
forth. Until the family circle (spec 16) runs on the server, a file per person does it, privately and offline.

## Flow
* **Send:** member screen → "Send Ma's medicines to another phone" → share sheet (WhatsApp, email, Drive…).
  The file has Ma's details (with where she lives), her medicines and times, and her dose records of the last 90 days.
  Not included: anyone else, photos (strip photos are files on the phone), a prescription waiting for review.
* **Open:** Settings → Family on another phone → "Open a file someone sent".
  * Sent from here before (same person id): "Update Ma?"
  * Someone with the same name already here (e.g. the "Me"/"Ma" made on first run): "Is this the same Ma?" → update
    her, or add as a new person.
  * Otherwise: "Add Ma?"

## What updating does
* Their details, medicines, times, end dates and other names come from the file.
* Kept from this phone: the stock count, strips taught and photographed here, the strip's expiry, pharmacy answers,
  "doctor confirmed both" pairs, the colour. Barcodes and taught strips are combined.
* Medicines are matched by id, then by name (so a medicine added on both phones isn't listed twice).
* A medicine this phone has for them that the file doesn't is **paused, not deleted** ("Not on the other phone").
* Dose records from both phones are kept. For the same dose, a person's own record beats an automatic "missed";
  otherwise the later one wins.
* Where they live: if it's this phone's zone, they live with this phone (reminders here); otherwise their zone is kept
  and their reminders stay on their own phone (spec 19).
* The schedule before is saved as a version ("Sent from another phone (date)"): Settings → Your data → Earlier versions of the list.

## Privacy
The file contains health information. The send screen says to send it only to people you trust. Nothing goes through
a TakeSure server.

## Later
The family circle (spec 16) replaces the manual file: changes and records go both ways automatically, encrypted.

## Tests (`tests/personFile.test.ts`)
Only that person in the file, zone written out, no photo paths; India phone updates its own "Ma" (zone cleared, stock
kept, matched by name); records go back to the caregiver mapped to its ids; a medicine missing from the file is
paused; a taken record beats an automatic missed; backups, newer files and broken files are refused clearly.

## 24 Oct 2026
* "Is X 'Me' on this phone?" is asked only when it's plausible: "Me" has no medicines yet, or shares one with the
  file. *No — add X* comes first. Otherwise a caregiver opening a parent's file could merge it into their own "Me"
  and pause their own medicines.
* Renaming "Me" keeps the meal times, language and time zone just typed.
