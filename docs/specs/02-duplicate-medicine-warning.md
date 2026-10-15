# Spec 02 — Same-medicine warning (duplicate contents)

## Problem
The same drug is sold under many brands. A person can end up with two brands of one drug on their schedule —
e.g. **Clopilet 75** and **Clopitab 75** are both clopidogrel 75 mg — after a pharmacy substitutes a brand or a new
prescription uses a different one. Taking both doubles the dose; for blood thinners, heart-rhythm and blood-pressure
medicines that is dangerous. A combination tablet can also repeat a single one (Telma 40 + Telma H, both telmisartan).

Today the app only notices exact repeats of the same medicine and strength ("Listed more than once"), and words it
as tidiness, not safety.

## Goal
Whenever one person's **active** medicines share an ingredient, the app says so plainly, wherever the person would
act on it, and keeps saying so until the medicine is removed/paused or the person records that the doctor confirmed it.

## What counts as an overlap
For each active medicine, its contents come from (in order):
1. the built-in medicine list, by brand name (Clopilet → clopidogrel; Telma H → telmisartan + hydrochlorothiazide);
2. otherwise any known ingredient name written in its name or other names ("Clopidogrel Tablets IP", alias "Clopidogrel 75").

Two active medicines of the **same person** overlap when they share at least one ingredient. Three kinds:

| Kind | Example | Message |
|---|---|---|
| Same contents, same strength | Clopilet 75 + Clopitab 75 | "Clopilet 75 and Clopitab 75 are the same medicine (clopidogrel). Taking both doubles the dose." |
| Same contents, different strength | Tide 10 + Tide 20 | "Tide 10 and Tide 20 are both torsemide. Check with your doctor that both are meant to be taken." |
| One contains the other's ingredient | Telma 40 + Telma H 40 | "Telma 40 and Telma H 40 both contain telmisartan. Check with your doctor that both are meant to be taken." |

Medicines whose contents are unknown are never flagged by contents (the existing same-name check still applies).
Different people's medicines are never compared. Paused/stopped medicines are ignored.

## Where it shows
1. **Medicines tab**, under the person's name: a red card per overlap with the message and buttons
   * **Merge into one** — only for same contents + same strength (combines times, stock, history; as today);
   * **Doctor confirmed both** — records the pair as intended; the card goes away for that pair only.
2. **Saving a medicine** (add, scan-to-add, edit): if it newly overlaps, an alert with the message and
   **Cancel / Save anyway**. (The existing "already in the schedule — update instead?" flow stays for exact repeats,
   with the message added.)
3. **Prescription review**: each item that overlaps a medicine that will stay on the schedule, or another included
   item, shows the message as a warning line (red).

## Recording "doctor confirmed"
`Medication.overlapOk: string[]` — ids of medicines this one is confirmed to be taken with, stored on both.
Removed automatically if either medicine is deleted. Editing a medicine's name or strength clears its confirmations
(it may now be a different medicine).

## Not in scope
Drug–drug interaction advice (different drugs that interact). That needs a vetted clinical source; the app must not
guess. The wording never tells the person to stop a medicine — only to check with their doctor.

## Tests (`tests/overlap.test.ts`)
* Clopilet 75 + Clopitab 75 → same, same strength, "doubles the dose".
* Tide 10 + Tide 20 → same contents, different strength.
* Telma 40 + Telma H 40 → partial, shared telmisartan.
* Generic name in the medicine name ("Clopidogrel Tablets") overlaps Clopilet.
* Different people, paused medicine, unknown contents, and confirmed pairs → no warning.
* Prescription check flags a new item against a kept medicine but not one being replaced or stopped.
