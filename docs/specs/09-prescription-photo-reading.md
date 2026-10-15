# Spec 09 — Reading prescription and chart photos reliably

## Problem (bug)
A clear, printed "My daily medicines" chart gave "No medicines found" on iPhone. The chart parser works on that page
(tested with a real reading of the photo). The cause is earlier: phone cameras store portrait photos sideways with a
"rotate when shown" flag. The text reader applies the flag to read the words, but line positions can come back in the
sideways frame. The app rebuilds table rows from positions, so rows became columns — all the times in one "row",
all the medicines in another, before any time — and every medicine was dropped.

Strip scanning wasn't affected because it already re-saves photos (flag applied) before reading.

## Fix
`readPage(uri, score)` in `src/ocr.ts`, used for prescriptions and charts:
1. Re-save the photo upright (flag applied) and at most 2000 px wide, then read it.
2. If that reading finds no medicines, read it turned 90°, 270° and 180° and keep the reading that finds the most.
3. If still nothing: the message shows the first lines the phone read (or says no text could be read), so the
   person can see whether it was a reading problem or a layout the app doesn't know.

## Handwriting
Handwritten prescriptions are not readable by the on-phone text reader (it reads print). The app says so and points
to Scan or Type. A future optional online reader could help; it would need internet and consent (see spec 07).

## Tests
`tests/label-rx.test.ts`: a real reading of the chart photo (positions included, name removed) gives all 7 medicines;
the same reading with sideways positions gives none — documenting why the photo is re-saved and turned.
