# Spec 05 — Expiry dates from the strip

## Problem
Strips print an expiry ("EXP 03/28", "Exp.Dt.: 06/2028", "EXPIRY DATE 04/2028"). The app reads that text during
every scan but throws it away. An elderly person can take tablets from an expired strip without noticing.

## Goal
Read the expiry whenever a strip is scanned, warn at the moment of taking if the strip has expired, and show
each medicine's strip expiry in Stock.

## Reading the date
`parseExpiry(text)` finds an expiry keyword followed by a month and year:
* keywords: EXP, EXP., EXPIRY, EXP. DATE, EXP.DT., EXPIRY DATE, USE BEFORE (any case, any punctuation);
* month and year: `03/28`, `03-28`, `03.2028`, `3/2028`, `MAR 2028`, `MAR-28`;
* two-digit years are 20YY; a result outside "3 years ago … 10 years ahead" is ignored as a misread;
* the manufacturing date (MFG/MFD) is never taken as expiry;
* if several different expiries are read (two strips in one photo), the **earliest** is used.

A printed month means usable until the **end** of that month.

## When scanning a dose
If the strip matches and its expiry has passed, the green result shows a red box:
"**This strip expired in Mar 2028.** Don't take it — use another strip or ask your pharmacist."
and the spoken announcement adds "This strip has expired." Taking can still be recorded (the person may use a new
strip of the same medicine), but the warning is the first thing under the medicine name.
If it expires within 30 days: a grey line "Strip expires end of Mar 2028."

## Remembering it
When a scan is confirmed for one medicine, its `expiry` (YYYY-MM) is saved on that medicine — it describes the strip
currently in use. Scan-to-add fills it in too. A newer reading replaces it.

## Medicines → Supplies
Each medicine shows "Strip expires Mar 2028" — amber when within 30 days ("Expires soon"), red when passed
("Strip expired — replace it"). A small **Clear** link removes a wrong reading.

## Tests (`tests/expiry.test.ts`)
* All the formats above, including the real strips (Tide-10 "MFG.04-26 EXP.03-28", Clopilet "Exp.Dt.:06/2028",
  Brillo "EXPIRY DATE 04/2028", Clopitab "EXPIRY 09/2027").
* MFG dates ignored; implausible years ignored; earliest of several.
* Status: expired after the end of the month, "soon" within 30 days, otherwise ok.
