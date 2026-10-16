import TextRecognition from '@react-native-ml-kit/text-recognition';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';
import { AppleText } from '../modules/apple-text/index.ts';
import type { OcrLine } from './label.ts';
import { cropFor } from './obb.ts';
import { detectorState, detectRegions, pickRegions, regionDetectorEnabled } from './regionModel.ts';
import { padBox, rereadCandidates, unrotateBox, type Box } from './regions.ts';
import { addRegions, addStep, newTrace, type ScanTrace } from './scanTrace.ts';

const WORK_WIDTH = 1600; // copies are resized to this width before rotating

export type ReaderName = 'apple-vision' | 'ml-kit';
const appleVision = Platform.OS === 'ios' && AppleText ? AppleText : null;
let last: ReaderName = appleVision ? 'apple-vision' : 'ml-kit';

/** Which reader read the most recent photo (kept with training photos, to compare the two). */
export const lastReader = (): ReaderName => last;

/** Whether this build has the Apple Vision reader (iPhone builds from ios-21 on). */
export const appleVisionAvailable = (): boolean => !!appleVision;

/** Whether the strip-region detector (YOLO, spec 10) is loaded and switched on. */
export const regionDetectorAvailable = (): boolean => detectorState() === 'ready' && regionDetectorEnabled();

// Which readers read the photos of the current scan (a scan reads several photos and crops), and on how many
// photos the region detector found the printed areas.
const used = { 'apple-vision': 0, 'ml-kit': 0 };
const detector = { photos: 0, found: 0, areas: 0 };
export function startScanStats() {
  used['apple-vision'] = 0;
  used['ml-kit'] = 0;
  detector.photos = detector.found = detector.areas = 0;
  hints.clear();
  nameCrops.clear();
}

// ---- Hints (spec 15, section 2a) ----
// Text that may point to a household medicine but must never be the only evidence for green: Vision's second-guess
// readings of a line, and the word-list reading (Vision with the household's words as its vocabulary).
const hints = new Set<string>();
/** Hint lines collected during the current scan (since startScanStats). */
export const scanHints = (): string[] => [...hints];

// Name areas cropped during the current scan (YOLO brand/contents areas, enlarged biggest print), per photo,
// so a scan that found nothing can read them again with the other reader or the word list without re-cropping.
const nameCrops = new Map<string, string[]>();
const keepCrop = (photo: string, crop: string) => {
  const list = nameCrops.get(photo) ?? [];
  if (list.length < 8) nameCrops.set(photo, [...list, crop]);
};

let householdWords: string[] = [];
/** The household's medicine words (brand, contents, taught words) for the word-list reading. */
export function setHouseholdWords(words: string[]) {
  householdWords = [...new Set(words.map((w) => w.trim()).filter((w) => w.length >= 3))].slice(0, 500);
}

/** "found 5 areas on 2 of 3 photos", "found nothing — full reading used", "off", "not in this build". */
export function scanDetectorLabel(): string {
  if (!regionDetectorEnabled()) return 'off';
  if (detectorState() === 'missing') return 'not in this build';
  if (!detector.photos) return detectorState() === 'loading' ? 'loading' : 'not used';
  if (!detector.found) return 'found nothing — full reading used';
  return `found ${detector.areas} area${detector.areas === 1 ? '' : 's'} on ${detector.found} of ${detector.photos} photo${detector.photos === 1 ? '' : 's'}`;
}
/** "Apple Vision", "Apple Vision (ML Kit for 2 of 9 reads)" or "Google ML Kit" — for the scan result. */
export function scanReaderLabel(): string {
  const a = used['apple-vision'];
  const m = used['ml-kit'];
  if (a && m) return `Apple Vision (ML Kit for ${m} of ${a + m} reads)`;
  if (a) return 'Apple Vision';
  if (m) return 'Google ML Kit';
  return '';
}

/**
 * Reads one photo. iPhone: Apple Vision (built into iOS, nothing sent anywhere), with Google ML Kit as the backup
 * if Vision isn't in this build or fails on a photo. Android: ML Kit. Both give lines in upright pixel positions.
 * See docs/specs/10-region-detector-and-text-readers.md.
 */
async function recognize(uri: string): Promise<OcrLine[]> {
  if (appleVision) {
    try {
      const lines = await appleVision.recognize(uri, null);
      last = 'apple-vision';
      used['apple-vision']++;
      for (const l of lines) for (const a of l.alternatives ?? []) hints.add(a);
      return lines.map((l) => ({ text: l.text, height: l.height, top: l.top, left: l.left, width: l.width, corners: l.corners }));
    } catch {
      // fall through to ML Kit
    }
  }
  last = 'ml-kit';
  used['ml-kit']++;
  return recognizeMlKit(uri);
}

async function recognizeMlKit(uri: string): Promise<OcrLine[]> {
  const res = await TextRecognition.recognize(uri);
  const out: OcrLine[] = [];
  for (const block of res.blocks) {
    for (const line of block.lines) {
      const corners = line.cornerPoints?.length === 4 ? line.cornerPoints.map((p) => ({ x: p.x, y: p.y })) : undefined;
      out.push({ text: line.text, height: line.frame?.height, top: line.frame?.top, left: line.frame?.left, width: line.frame?.width, corners });
    }
  }
  return out;
}

/** Reads text from a photo on the device, one entry per printed line, with its position. */
export async function readLines(uri: string): Promise<OcrLine[]> {
  return recognize(uri);
}

const PAGE_WIDTH = 2000; // enough for prescription print; full 12 MP photos are slow and no more readable

/**
 * Reads a printed page (prescription, medicine chart) whose rows must be rebuilt from line positions.
 * Phone photos are often stored sideways with a "rotate when shown" flag; the reader honours the flag for the
 * words but may give positions sideways, which turns rows into columns. So the photo is first re-saved upright
 * (flag applied, smaller), and if that reading yields nothing useful the page is tried turned the other ways.
 * `score` says how useful a reading is (e.g. how many medicines were found); the best one is returned.
 * See docs/specs/09-prescription-photo-reading.md.
 */
export async function readPage(uri: string, score: (lines: OcrLine[]) => number): Promise<{ lines: OcrLine[]; turned: number }> {
  let base = uri;
  try {
    const ref = await ImageManipulator.manipulate(uri).renderAsync();
    const ctx = ImageManipulator.manipulate(uri);
    if (ref.width > PAGE_WIDTH) ctx.resize({ width: PAGE_WIDTH });
    base = (await (await ctx.renderAsync()).saveAsync({ compress: 0.92, format: SaveFormat.JPEG })).uri;
  } catch {
    // Use the original photo.
  }
  let best = { lines: await recognize(base), turned: 0 };
  let bestScore = score(best.lines);
  if (bestScore > 0) return best;
  for (const turned of [90, 270, 180]) {
    try {
      const img = await (await ImageManipulator.manipulate(base).rotate(turned).renderAsync()).saveAsync({ compress: 0.92, format: SaveFormat.JPEG });
      const lines = await recognize(img.uri);
      const sc = score(lines);
      if (sc > bestScore) {
        best = { lines, turned };
        bestScore = sc;
      }
    } catch {
      // try the next way round
    }
  }
  return best;
}

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Boxes (on the original photo) for each photo read, kept for training labels.
const photoInfo = new Map<string, { width: number; height: number; boxes: Box[] }>();
export function boxesFor(uri: string) {
  return photoInfo.get(uri);
}

// What each step saw on each photo (detector boxes, text per reading), kept with training photos (spec 12).
const traces = new Map<string, ScanTrace>();
export function traceFor(uri: string): ScanTrace | undefined {
  return traces.get(uri);
}

/** Reads one image and records the step in the photo's trace. */
async function readStep(trace: ScanTrace | undefined, step: string, uri: string): Promise<OcrLine[]> {
  const t0 = Date.now();
  const lines = await recognize(uri);
  if (trace) addStep(trace, step, last, lines.map((l) => l.text), Date.now() - t0);
  return lines;
}

const toBox = (l: OcrLine): Box | undefined =>
  l.left !== undefined && l.top !== undefined && l.width !== undefined && l.height !== undefined
    ? { text: l.text, left: l.left, top: l.top, width: l.width, height: l.height, ...(l.corners ? { corners: l.corners } : {}) }
    : undefined;

class LineSet {
  private seen = new Set<string>();
  readonly lines: OcrLine[] = [];
  add(lines: OcrLine[]) {
    for (const l of lines) {
      const k = key(l.text);
      if (k.length < 2 || this.seen.has(k)) continue;
      this.seen.add(k);
      // Positions aren't comparable across photos and rotations; keep only the text size.
      this.lines.push({ text: l.text, height: l.height });
    }
  }
}

/**
 * Reads one photo upright, upside down and sideways; maps every box back onto the photo;
 * then crops the most useful areas (biggest print, strength lines), enlarges them and reads them again.
 */
async function readPhoto(uri: string, set: LineSet, opts: { rotations: number[]; reread: boolean }) {
  const boxes: Box[] = [];
  let size: { width: number; height: number } | undefined;
  try {
    const ref = await ImageManipulator.manipulate(uri).renderAsync();
    size = { width: ref.width, height: ref.height };
  } catch {
    // size unknown: skip rotation mapping and re-reading
  }
  const trace = size ? newTrace(size.width, size.height) : undefined;
  if (trace) {
    traces.set(uri, trace);
    if (traces.size > 40) traces.delete(traces.keys().next().value!); // only recent scans can still be saved
  }
  const upright = await readStep(trace, 'whole photo, upright', uri);
  set.add(upright);
  for (const b of upright) {
    const x = toBox(b);
    if (x) boxes.push(x);
  }
  if (size && trace && (await readFoundAreas(uri, size, set, trace))) {
    photoInfo.set(uri, { ...size, boxes });
    return; // name and strength areas were found and read; the slow every-way-up reading isn't needed
  }
  const turnedText = new Map<Box, number>(); // box -> rotation it was readable at
  for (const degrees of opts.rotations) {
    try {
      const ref = await ImageManipulator.manipulate(uri).resize({ width: WORK_WIDTH }).rotate(degrees).renderAsync();
      const img = await ref.saveAsync({ compress: 0.9, format: SaveFormat.JPEG });
      const lines = await readStep(trace, `whole photo, turned ${degrees}°`, img.uri);
      set.add(lines);
      if (size) {
        for (const l of lines) {
          const x = toBox(l);
          if (!x) continue;
          const back = unrotateBox(x, degrees, size, WORK_WIDTH);
          boxes.push(back);
          turnedText.set(back, degrees);
        }
      }
    } catch {
      // Rotation is a best effort; the upright reading is still used.
    }
  }
  if (size) photoInfo.set(uri, { ...size, boxes });

  if (opts.reread && size) {
    for (const b of rereadCandidates(boxes, 4)) {
      try {
        const crop = padBox(b, size);
        const enlargeTo = Math.min(1800, Math.max(900, crop.width * 2.5));
        let ctx = ImageManipulator.manipulate(uri).crop(crop).resize({ width: enlargeTo });
        const turn = turnedText.get(b);
        if (turn) ctx = ctx.rotate(turn); // read it the way up it was readable
        const img = await (await ctx.renderAsync()).saveAsync({ compress: 0.95, format: SaveFormat.JPEG });
        keepCrop(uri, img.uri);
        set.add(await readStep(trace, `re-read enlarged: “${b.text.slice(0, 30)}”`, img.uri));
      } catch {
        // Re-reading is a bonus; ignore failures.
      }
    }
  }
}

/**
 * Region detector path (spec 10): finds the brand / contents / strength / expiry areas, crops each one, turns it
 * level, enlarges it and reads it — also upside down, since a rotated box can't tell which way up the text is.
 * Returns true only when both a name (brand or contents) and a strength area were found and read; otherwise the
 * caller also reads the whole photo every way up, so a weak detector never makes a scan worse — its crops are
 * then extra readings on top.
 */
async function readFoundAreas(uri: string, size: { width: number; height: number }, set: LineSet, trace: ScanTrace): Promise<boolean> {
  if (!regionDetectorEnabled()) return false;
  let regions;
  try {
    regions = await detectRegions(uri, size);
  } catch {
    regions = null;
  }
  if (!regions) {
    trace.detector = 'missing';
    return false;
  }
  detector.photos++;
  const picked = pickRegions(regions);
  addRegions(trace, regions, picked);
  if (!picked.length) {
    trace.detector = 'nothing';
    return false;
  }
  detector.found++;
  detector.areas += picked.length;
  for (const r of picked) {
    const c = cropFor(r, size);
    // Enlarge so the text is about 64 px tall: small print on foil reads far better that way.
    const k = Math.max(1, Math.min(4, 64 / Math.max(1, r.height)));
    const width = Math.round(Math.min(1800, Math.max(600, c.width * k)));
    for (const turn of [c.rotate, c.rotate + 180]) {
      try {
        const ref = await ImageManipulator.manipulate(uri)
          .crop({ originX: c.originX, originY: c.originY, width: c.width, height: c.height })
          .rotate(turn)
          .resize({ width })
          .renderAsync();
        const img = await ref.saveAsync({ compress: 0.95, format: SaveFormat.JPEG });
        if (r.cls === 'brand' || r.cls === 'contents' || r.cls === 'strength') keepCrop(uri, img.uri);
        set.add(await readStep(trace, `${r.cls} area (${r.score.toFixed(2)}), ${turn === c.rotate ? 'level' : 'upside down'}`, img.uri));
      } catch {
        // one area failing to read is fine; the others and the upright reading remain
      }
    }
  }
  const enough = picked.some((r) => r.cls === 'brand' || r.cls === 'contents') && picked.some((r) => r.cls === 'strength');
  trace.detector = enough ? 'used' : 'extra';
  return enough;
}

/**
 * Medicine strips print text in several directions (half the Clopilet strip is upside down).
 * Reads the photo every way up, re-reads the name/strength areas enlarged, and combines everything.
 */
export async function readLinesAnyOrientation(uri: string): Promise<OcrLine[]> {
  const set = new LineSet();
  await readPhoto(uri, set, { rotations: [180, 90, 270], reread: true });
  return set.lines;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Shiny foil hides different letters at different angles. Takes several photos a moment apart
 * (the person tilts the strip slightly between them) and combines the text read from all of them.
 */
export async function readBurst(
  takePhoto: () => Promise<string>,
  opts: { shots?: number; gapMs?: number; onShot?: (n: number, of: number) => void } = {},
): Promise<OcrLine[]> {
  const shots = opts.shots ?? 3;
  const uris: string[] = [];
  for (let i = 0; i < shots; i++) {
    opts.onShot?.(i + 1, shots);
    uris.push(await takePhoto());
    if (i < shots - 1) await wait(opts.gapMs ?? 450);
  }
  const set = new LineSet();
  for (let i = 0; i < uris.length; i++) {
    // Full treatment for the first photo; upright + upside down + re-read for the rest (keeps it quick).
    await readPhoto(uris[i], set, { rotations: i === 0 ? [180, 90, 270] : [180], reread: true });
  }
  return set.lines;
}

/**
 * A scan that matched nothing gets a second look at the same photos before asking for new ones (spec 15, 2a):
 *  - iPhone: Google ML Kit reads each photo (upright and upside down) and the name areas already cropped.
 *    The two readers make different mistakes, so this is full evidence (it can lead to green).
 *  - iPhone: Apple Vision reads the name areas again with the household's words as its vocabulary.
 *    That reading leans towards household names, so it only goes into the hints (amber at most).
 * Android already reads with ML Kit and has no word list, so it returns nothing new.
 */
export async function readSecondLook(photos: string[]): Promise<OcrLine[]> {
  if (!appleVision) return [];
  const set = new LineSet();
  for (const photo of photos) {
    const trace = traces.get(photo);
    const crops = nameCrops.get(photo) ?? [];
    const step = async (label: string, uri: string) => {
      const t0 = Date.now();
      try {
        const lines = await recognizeMlKit(uri);
        used['ml-kit']++;
        if (trace) addStep(trace, `second look (ML Kit): ${label}`, 'ml-kit', lines.map((l) => l.text), Date.now() - t0);
        set.add(lines);
      } catch {
        // ML Kit missing or failed: nothing more to add
      }
    };
    await step('whole photo, upright', photo);
    try {
      const turned = await (await ImageManipulator.manipulate(photo).resize({ width: WORK_WIDTH }).rotate(180).renderAsync()).saveAsync({ compress: 0.9, format: SaveFormat.JPEG });
      await step('whole photo, turned 180°', turned.uri);
    } catch {
      // the upright reading is still used
    }
    for (const [i, crop] of crops.entries()) await step(`name area ${i + 1}`, crop);
    if (householdWords.length) {
      for (const [i, crop] of crops.entries()) {
        const t0 = Date.now();
        try {
          const lines = await appleVision.recognize(crop, householdWords);
          used['apple-vision']++;
          for (const l of lines) {
            hints.add(l.text);
            for (const a of l.alternatives ?? []) hints.add(a);
          }
          if (trace) addStep(trace, `second look (Vision + household words, hint only): name area ${i + 1}`, 'apple-vision', lines.map((l) => l.text), Date.now() - t0);
        } catch {
          // a crop that can't be read is fine
        }
      }
    }
  }
  return set.lines;
}

export function isNotLinkedError(e: unknown): boolean {
  return String(e).includes('linked');
}
