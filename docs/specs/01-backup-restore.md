# Spec 01 — Backup and restore

## Problem
Everything (people, medicines, schedules, dose history, stock, schedule versions, taught strips) lives only in
the phone's local storage. A lost, broken or reset phone — or reinstalling the app — loses it all.

## Goal
A person can save everything to a single file, keep it wherever they like (Google Drive, WhatsApp to themselves,
email, computer), and bring it back on the same or a new phone. No account, no server, works offline.

## Out of scope
Automatic cloud sync, syncing between two phones, merging two backups. (Sync needs accounts — see the product notes.)

## The file
* Name: `MedSync backup 2026-10-15.json` (date of export).
* JSON, human-readable:
  ```json
  { "app": "medsync", "kind": "backup", "format": 1,
    "exportedAt": "2026-10-15T09:30:00.000Z",
    "summary": { "members": 3, "medicines": 12, "logs": 410 },
    "state": { …the whole AppState… } }
  ```
* **Included:** members, medicines (with taught strip fingerprints), dose logs, stock events, settings, schedule
  versions (history).
* **Left out:** photos (training photos, prescription images) — they are large and personal. A prescription
  waiting for review (`pending`) is left out because its photos would be missing.
* Typical size: well under 1 MB, so it can go over WhatsApp on a poor connection.
* The file contains health information. The export screen says so in one line.

## Export
Settings → **Backup** card → **Save a backup** → the phone's share sheet opens with the file.
After a successful share, `settings.lastBackupAt` is set and the card shows "Last backup: today / 12 days ago".

## Reminder to back up
If there is at least one medicine and the last backup is more than 30 days old (or never), the Backup card shows
"No backup for 30+ days" in the warning colour. No pop-ups, no nagging elsewhere.

## Restore
Settings → Backup → **Restore from a backup** → pick the file (document picker).
1. The file is checked (`parseBackup`). Rejected with a clear message if: not JSON; not a MedSync backup;
   from a newer format than this app understands ("Update the app to restore this backup"); missing required parts.
2. A confirmation shows what's in it: "Backup from 15 Oct 2026: 3 people, 12 medicines, 410 dose records."
   and warns "This replaces everything on this phone."
3. Before replacing, the current data is kept as a **safety copy** on the phone (one copy, overwritten each restore).
   The Backup card then offers **Undo last restore** until the next restore.
4. Reminders are rescheduled automatically (they follow the data).

## Robustness
* Unknown extra fields are kept (forward compatibility within format 1).
* Missing optional fields get defaults (settings merged over defaults, missing arrays become empty).
* Medicines whose person is not in the file are dropped, with a count in the confirmation.
* Restoring never runs half-way: the parsed state is built completely before anything is replaced.

## Known behaviour
After restoring an older backup, doses from yesterday and today that have no record are marked missed, as on any
day (the app only fills in missed doses for those two days). Doses taken on the old phone after the backup was made
are not known to the new one.

## Tests (unit, `tests/backup.test.ts`)
* Round trip: `makeBackup` → JSON → `parseBackup` gives the same state (minus photos / pending).
* Rejects: garbage, other JSON, `kind` not backup, newer `format`.
* Repairs: missing settings fields, missing arrays, orphan medicines dropped and counted.
* Prescription image paths are not in the file.
