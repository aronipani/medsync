# Spec 04 — A bigger offline medicine list

## Problem
The built-in list has ~65 hand-checked brands. India sells tens of thousands. When a strip's brand isn't in the
list, the app can't fill in its contents, can't recognise a torn brand by its contents, and the same-medicine
warning (spec 02) can't see it.

## Goal
Ship a large brand → contents → strengths list **inside the app** (works offline), built from a data source whose
licence allows it, without making scanning less safe.

## Data source — a decision for the owner
The app does not include a large list yet. Candidates and the question to settle for each:
* Public datasets of Indian medicines (e.g. Kaggle "A–Z medicine dataset of India") are usually scraped from
  pharmacy websites. **Check the licence and the site's terms before shipping.**
* Government lists (Jan Aushadhi product list, CDSCO approvals) are reliable for contents but have few brand names.
* A pharmacist-curated list for the medicines your users actually take (slower, highest quality).

Whatever is chosen, the build step below turns it into the app's format; the hand-checked list always wins on conflict.

## Format inside the app
`src/data/medicines.ts` (generated, not edited by hand):
```ts
export const MEDICINES = { format: 1, source: 'Name of dataset, licence', built: '2026-10-15',
  entries: [ [['Clopidogrel'], ['75'], ['Clopilet', 'Clopitab', 'Deplatt']], … ] };
```
One entry per set of contents: ingredients (label order), strengths seen (combos as "40/12.5"), brand names.
Expected size for ~50k brands: ~1–2 MB, compressed further in the app bundle.

## Build step
`node --experimental-strip-types scripts/build-medicine-list.ts --csv data.csv --name name
 --composition short_composition1,short_composition2 [--skip-if Is_discontinued=TRUE] --source "…"`
* Brand cleaning: "Telma-H 40 Tablet" → "Telma-H"; drops strengths, pack sizes and form words
  (tablet, capsule, syrup, injection, strip of 10 …).
* Contents parsing: "Telmisartan (40mg) + Hydrochlorothiazide (12.5mg)" → ingredients
  [Telmisartan, Hydrochlorothiazide], strength "40/12.5".
* Skipped and counted: brands shorter than 4 letters; brands that are common English words
  ("Relief", "Calm", "Store"…); a brand name appearing with **different** contents (ambiguous); medicines
  without contents.
* Brands already in the hand-checked list are taken from the hand-checked list.
* Prints a summary (rows read, entries, brands kept, each skip reason) and writes `src/data/medicines.ts`.

## How the app uses it
* Brand lookup (filling contents, scan-to-add suggestions, same-medicine warning, prescription matching) searches
  hand-checked + generated lists through an index (fast with 50k names).
* **Not** used for the "this looks like a different medicine" check during dose scanning — that keeps using the
  hand-checked list until the larger list has been tested on real strips, because a large list of short or
  word-like brand names would cause false red results.
* Every suggestion still goes to a person to confirm, as now.

## Updates
New lists ship with app updates (no download needed). A later version may download a newer list on Wi-Fi.

## Tests (`tests/medlist.test.ts`)
* Brand cleaning and contents parsing on realistic rows.
* Ambiguous brands, short brands, common words and rows without contents are skipped and counted.
* Hand-checked brands win; lookups find generated brands; same-medicine warning works on a generated brand.
