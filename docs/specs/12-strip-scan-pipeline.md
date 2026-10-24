# Spec 12 — Strip scan pipeline (how a scan works, end to end)

How a strip photo becomes green / amber / red, and what is kept for retraining. Ties together spec 05 (expiry),
spec 10 (region detector and text readers) and spec 11 (test scan). Diagrams are Mermaid; GitHub draws them.

## 1. The scan, step by step

```mermaid
flowchart TD
    A(["Scan tab · Test scan · Scan to add ·<br/>Add photos for training (spec 13)"]) --> B[Take photo or pick from library]
    B --> C["Read whole photo upright<br/>Apple Vision on iPhone · ML Kit on Android<br/>(ML Kit backup if Vision fails)"]
    C --> D{Region detector<br/>on and loaded?}
    D -- no --> R
    D -- yes --> E["Step 1 · FIND<br/>YOLO11n-OBB on a 640 px copy<br/>rotated boxes: brand · contents · strength · expiry"]
    E --> F{"Any box ≥ 0.35?<br/>(up to 2 brand, 2 strength,<br/>1 contents, 1 expiry)"}
    F -- no --> R
    F -- yes --> G["Step 2 · READ each box<br/>crop · turn level · enlarge to ~64 px text<br/>read level AND upside down"]
    G --> H{Found both a name<br/>and a strength box?}
    H -- "yes: detector 'used'" --> M
    H -- "no: detector 'extra'" --> R
    R["Read whole photo turned 180° · 90° · 270°<br/>then re-read the biggest print and strength lines enlarged"] --> M
    M["Combine all text read · match against medicines<br/>(name, strength, other brands, taught strips, barcodes)"] --> N{Result}
    N -- "name + strength" --> OK([Green])
    N -- name only --> CHK([Amber: check the strength])
    N -- "nothing / other medicine / other strength" --> X{First photo?}
    X -- "yes: glare retry" --> B2["Take 2 more photos,<br/>tilt a little"] --> C
    X -- no --> RED([Red])
```

Scan to add takes three photos at once (tilting between them) instead of the one-then-two glare retry.

Every reading in this flow is one **step** recorded in the photo's **trace** (section 3).

Why "both a name and a strength box": the trial model finds brands about half the time and strengths rarely. Skipping
the slow every-way-up reading on a brand box alone would miss strengths, so the detector only replaces it when it found
both; otherwise its crops are extra readings on top. A weak detector can't make a scan worse.

## 2. What happens to the photos

```mermaid
flowchart TD
    S([Scan result]) --> T{"Save scan photos for training<br/>switched on?"}
    T -- no --> Z([Photos discarded])
    T -- yes --> U{How did it end?}
    U -- "Marked taken / taught" --> L["Labelled<br/>(medicine known)"]
    U -- "Added from library with a name (spec 13)" --> L
    U -- "Test scan: Yes, that's right" --> L
    U -- "Test scan: No / not recognised → 'Which medicine is it?' → picked" --> L
    U -- "Red · closed · unanswered · 'None of these'" --> UL["Unlabelled<br/>(with the reason)"]
    L --> K["On the phone: photo (1280 px) + manifest entry<br/>auto-labels from the text boxes · trace"]
    UL --> K
    K --> EX{"Export (.zip) or<br/>Send for training (email)"}
    EX --> ZIP["images/ or unlabelled/ — clean photo<br/>boxed/ — same photo with the boxes drawn (SVG)<br/>labels/ — auto-labels (labelled photos)<br/>predictions/ — detector boxes with confidence<br/>scans/ — text read at each step<br/>manifest.json"]
    ZIP --> PC["On the computer: review.py (boxed JPEGs) ·<br/>CVAT (correct labels, start from predictions) ·<br/>autolabel.py → prepare.py → train.py → export.py"]
    PC --> APP([New model in assets/models → push → next build])
```

## 3. The trace: both steps, kept with every photo

A scan has two steps that can fail separately — **finding** the printed areas (the detector) and **reading** them
(the text reader). A failed scan is only useful for improving the right step if it says which one failed. So for every
photo read, `src/ocr.ts` keeps a trace (`src/scanTrace.ts`), saved in the photo's manifest entry and exported:

| Kept | Where in the export | Answers |
|---|---|---|
| Clean photo | `images/` (labelled) or `unlabelled/` | — |
| Photo with the boxes drawn on it, and the text of every step beside it | `boxed/<photo>.svg` (opens in a browser; solid = cropped and read, dashed = found but not read) | Where did it look? |
| Detector boxes: class, confidence, rotated corners (0…1), picked or not | `predictions/<photo>.txt` (YOLO-OBB + confidence) and `trace.regions` | Did step 1 find the name and strength? |
| Every reading: what was read (upright, each turn, each crop, each re-read), by which reader, how long | `scans/<photo>.txt` and `trace.steps` | Did step 2 read them correctly? |
| What the detector did: off · missing · nothing · extra · used | first line of `scans/<photo>.txt`, `trace.detector` | Was the fast path taken? |

How to read a failed scan (`training/review.py --only-failed` makes JPEGs of the boxed photos):
* **No box on the name or strength** → step 1 failed: correct the boxes in CVAT (load `predictions/` as a start) and
  retrain the detector.
* **Box in the right place, wrong or no text** → step 2 failed: glare, blur or print too small for the reader.
  More enlargement, or a better reader, helps — not more detector training.
* **Right text, still no match** → the medicine's saved name or strength, or the matching rules (`src/match.ts`).

Size: about 1–3 KB of text per photo next to a ~200 KB photo. Traces are kept in memory for the last 40 photos only
(a photo can only be saved shortly after it was read).

## 4. Code map

| Part | File |
|---|---|
| Scan screens | `app/(tabs)/scan.tsx`, `app/test-scan.tsx`, `app/scan-add.tsx` |
| Reading flow, detector path, glare retry, traces | `src/ocr.ts` |
| Text readers | `modules/apple-text/` (iPhone), `@react-native-ml-kit/text-recognition` |
| Detector run / decode | `src/regionModel.ts` / `src/obb.ts` |
| Trace, predictions file, boxed SVG, readable account | `src/scanTrace.ts` |
| Matching | `src/match.ts`, `src/learn.ts` (taught strips), `src/label.ts` |
| Training photos, export, email | `src/training.ts` |
| Computer side | `training/` (README there) |

## Tests
`tests/scanTrace.test.ts`: boxes kept relative and written as predictions with confidence (clamped to the photo);
steps capped; readable account per step; "no boxes" said plainly; boxed SVG points at the exported photo by relative
path, picked boxes solid and others dashed, text escaped. `tests/obb.test.ts` and `tests/testScan.test.ts` cover the
detector decoding and test-scan outcomes.

## Strength and QR safety (24 Oct 2026)
* A strength printed with its unit, or right after the name, that disagrees with the prescription wins over the
  expected number turning up elsewhere on the strip (`strengthClash` in `src/match.ts`; same rule in
  `src/household.ts`). Temperatures, addresses and pack counts are removed first. Combination strengths that add up
  agree (500 + 125 = 625).
* QR text goes through the same look-alike and strength checks as printed text. Only a linked barcode goes straight
  to green.
* A taught strip gives green only when the strength is read too (amber otherwise), and is compared against every
  taught strip in the house.
* A result is dropped if the person on screen changed during the read; the person picker is hidden while reading.
* Tests: `tests/strength-safety.test.ts`.
