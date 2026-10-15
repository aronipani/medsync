# Spec 10 — Strip-region detector + platform text readers

## Goal
Read strips faster and more reliably by splitting the job in two:

1. **Find** where the brand, contents, strength and expiry date are printed — the YOLO11n-OBB model in `training/`
   (classes `brand`, `contents`, `strength`, `expiry`).
2. **Read** only those areas — Apple Vision on iPhone, Google ML Kit on Android.

Today `src/ocr.ts` reads the whole photo four times (upright, 180°, 90°, 270°), then guesses the name and strength
areas from the reader's own boxes (`rereadCandidates`) and reads those again. That is 5–8 full reads per photo, and
the guess fails when glare hides part of the name. The detector replaces the guessing and most of the extra reads.

## Why two readers
| | Apple Vision (iPhone) | Google ML Kit (Android) |
|---|---|---|
| Where it runs | Built into iOS, on the phone | Bundled with the app, on the phone |
| App size | Nothing extra | Kept as now |
| Data | Nothing sent anywhere | ML Kit may send Google anonymous usage statistics (never photos) |
| Strip print | Good on small, tilted Latin print | Good, as today |

Strip names and strengths are printed in English, so Vision not reading Bengali/Hindi doesn't matter here.
ML Kit is removed from the iPhone build, so the privacy text becomes per-platform.

## Design

### 1. One text-reader seam — `src/textReader.ts`
```ts
export interface TextReader { recognize(uri: string): Promise<OcrLine[]> }
export const textReader: TextReader = Platform.OS === 'ios' ? appleVision : mlKit;
```
`recognize()` in `src/ocr.ts` calls `textReader.recognize()`. Everything above it (`readPage`, `readPhoto`,
`readBurst`, label matching, training boxes) stays the same. Both readers must return `OcrLine` in **upright pixel
coordinates of the photo as shown** (orientation flag applied), top-left origin, with the four corners in reading order.

### 2. Apple Vision module — `modules/apple-text/` (local Expo module, Swift)
* `recognize(uri) -> [{ text, left, top, width, height, corners }]` using `VNRecognizeTextRequest`:
  `recognitionLevel = .accurate`, `recognitionLanguages = ["en-US"]`, `usesLanguageCorrection = false`
  (correction "fixes" brand names into dictionary words), `minimumTextHeight` ≈ 0.01.
* Load the image with its orientation (`CGImagePropertyOrientation` from the file) so coordinates are upright.
* Vision boxes are normalised with a bottom-left origin: convert to pixels with `y = (1 − maxY) × height`;
  corners from the observation's `topLeft / topRight / bottomRight / bottomLeft`.
* One `VNRecognizedTextObservation` = one line (`topCandidates(1)`), matching ML Kit's line level.
* Optional later: `customWords` from the medicine list to help with brand names.
* Exclude ML Kit from iOS autolinking in `react-native.config.js`
  (`'@react-native-ml-kit/text-recognition': { platforms: { ios: null } }`).

### 3. Detector — `src/regionModel.ts` (+ pure `src/obb.ts`)
* Runtime: `react-native-fast-tflite` with `assets/models/strip-regions.tflite` (float16, 960 px), Core ML delegate on
  iPhone, GPU delegate on Android with CPU fallback. Add `tflite` to Metro `assetExts`.
* Input: the photo re-saved upright and letterboxed to 960×960 RGB. Getting raw pixels from a photo URI needs a small
  native helper (`decodeRGB(uri, size)`); it lives in the same local module, with a Kotlin side for Android.
* **Export without built-in NMS** (`export.py`: `nms=False`). Decoding the raw output (centre, size, angle, class
  scores) and rotated-box NMS are done in `src/obb.ts` — pure TypeScript, unit-tested, independent of exporter quirks.
* Output: `Region[]` (`brand | contents | strength | expiry`, rotated corners, confidence) mapped back to photo pixels.

### 4. New reading path in `readPhoto`
1. Detect regions on the upright photo.
2. If at least one `brand` or `contents` box has confidence ≥ 0.35:
   * crop each box (padded), turn it level using the box angle, enlarge to ~900–1800 px wide, read it;
   * also read the crop turned 180° (a rotated box's angle can't tell upside down from upright);
   * an `expiry` box is read the same way and its text goes to `parseExpiry` (spec 05) first;
   * keep the full upright reading too (batch and anything the detector missed).
   * Skip the 90° / 270° / 180° full-photo reads.
3. Otherwise, fall back to today's path (all orientations + `rereadCandidates`).
4. Lines from a `strength` box are tagged so `label.ts` can prefer them over stray "mg" text (small follow-up).

Expected: about 3–6 small reads instead of 5–8 full ones, and names found under glare where the reader alone
misses the line.

### 5. Switch and comparison
* Settings → Training photos gets **"Reader: automatic / old method"** while this is new.
* Each scan records which path ran and whether it matched (stays on the phone; included in the training export),
  so old and new can be compared on the same strips before the old path becomes fallback-only.

## Privacy text (spec 03)
* iPhone: "Text is read from photos on the phone by Apple's built-in reader. Nothing is sent anywhere."
* Android: unchanged ML Kit wording.
* `src/legal.ts` picks by platform; `PRIVACY.md` describes both. `tests/legal.test.ts` updated.

## Order of work
1. Text-reader seam + Apple Vision module; ML Kit removed from iOS; privacy text. Check on iPhone that Vision
   readings match the `OcrLine` format (the spec 09 chart fixture must still give all 7 medicines).
2. `obb.ts` decoding + NMS with tests; model export with `nms=False`; `regionModel.ts`; RGB helper.
3. Crop-and-read path with fallback and the Settings switch.
4. Compare on real strips; retrain with more `strength` examples (small boxes need more data).

## Training data (done on this branch)
* The phone's auto-labels and `training/regions.py` now mark an `expiry` box on any line with a readable expiry date.
* Photos of scans nobody confirmed (red, unreadable, closed — Scan tab and Scan to add) are kept when "Save scan photos
  for training" is on, without a label, and exported under `unlabelled/` with the reason. Before, only confirmed or
  taught scans were kept, so the hardest strips never reached training.
* A photo where no box was found gets no label file (it used to get an empty one, which would teach "nothing here").

## Needed
* The trained weights (`best.pt`, or the exported `.tflite`) — not in the repo yet. Add them under
  `assets/models/` (a few MB) or keep `training/runs/` out of git and attach the exported file to a release.
* An iPhone for testing step 1 (the CI IPA via AltStore is enough).

## Tests
* `tests/obb.test.ts`: decoding a recorded raw model output gives the expected boxes; NMS keeps the best of
  overlapping boxes at different angles; mapping from 960×960 letterbox back to photo pixels.
* `tests/textReader.test.ts`: Vision → `OcrLine` conversion (bottom-left normalised → top-left pixels, corners order).
* Existing `strips.test.ts`, `label-rx.test.ts` and `regions.test.ts` unchanged and passing.
