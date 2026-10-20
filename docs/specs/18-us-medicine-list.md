# Spec 18 — US medicine list (FDA NDC Directory)

## Problem
A US box (the Sandoz albuterol inhaler) was read by guessing which printed line is the name, and the guess picked
"Net Contents 6.7". Its barcode didn't help: a barcode only holds a product number, and the app had no list of numbers.

## Goal
Recognise US medicines exactly from their **NDC** (National Drug Code), offline, from a list built into the app, and
keep that list separate from the Indian / hand-checked list so the two can't be confused.

## Source
FDA NDC Directory, `https://www.accessdata.fda.gov/cder/ndctext.zip` (`product.txt`, `package.txt`).
Public domain (CC0), updated daily by the FDA. Listed: US prescription and over-the-counter finished products.

## What is kept
* Prescription products, and over-the-counter products taken by mouth, inhaled, or used in the eye or nose
  (sunscreens, hand gels, toothpaste and skin products are left out).
* Not kept: products or packages whose marketing has ended, sample packs, excluded listings, products without a strength.
* Per product: name (brand as printed, e.g. "ProAir HFA"; a generic product is named by its contents, "Albuterol"),
  contents (salts dropped), strength ("90 mcg", "5/10 mg", "100 mg/5 mL"), unit (puff, tablet, capsule, ml, drops,
  injection, sachet) and maker.
* Per package: its 10-digit NDC, pointing to its product. Stored as one sorted string, looked up by binary search.

## Kept apart from the Indian list
* `src/data/us-medicines.ts` is its own file; nothing from it goes into the brand index in `drugdb.ts`
  (brand lookup, "looks like a different medicine", the same-medicine warning).
* It is looked up **only by NDC**: from a barcode (UPC-A `3` + NDC10 + check, or GTIN-14 `003…` in the GS1
  DataMatrix) or from printed text (`NDC 0781-7296-85`, or the 11-digit `00781-7296-85`). An NDC belongs to one US
  product, so an Indian strip or an Indian barcode (`890…`) never finds anything.
* Later, if wanted: US brand names behind a setting ("US medicines", off by default).

## How the app uses it
* **Scan to add:** a US barcode or printed NDC fills in the draft from the list (shown as "Found in the US medicine
  list (FDA)…"). It wins over guessing from the print. A person still checks it against the box before saving.
* **Scan (dose time):** a US barcode not yet linked to a medicine is checked as if its product's name and strength had
  been read from the strip: the usual rules decide green, amber or red.

## Keeping it up to date
* `.github/workflows/us-medicine-list.yml` runs on the 3rd of every month (and by hand): downloads the FDA file,
  rebuilds the list, runs the typecheck and all tests with it, and commits it when it changed.
* The build refuses to write a list that looks wrong: fewer than 20,000 package codes, larger than 12 MB, no albuterol
  inhaler, a lookup that fails, or a changed FDA file format (missing columns).
* A commit by the workflow doesn't start the app builds; the new list ships with the next app build.
* By hand: `npm run medicine-list:us` (or `--zip ndctext.zip` for a file already downloaded).
* Later: the TakeSure server (spec 16) can serve the newest list so the app updates it on Wi-Fi without a new build.

## Tests (`tests/uslist.test.ts`)
FDA-format rows: albuterol found by UPC, DataMatrix and printed NDC (10- and 11-digit); brands kept as printed;
combinations; sunscreen, ended products, samples and products without a strength left out; Indian text and barcodes
find nothing; a US product checks like a read strip; a changed file format stops the build.
