import TextRecognition from '@react-native-ml-kit/text-recognition';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { OcrLine } from './label.ts';
import { padBox, rereadCandidates, unrotateBox, type Box } from './regions.ts';

const WORK_WIDTH = 1600; // copies are resized to this width before rotating

async function recognize(uri: string): Promise<OcrLine[]> {
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

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Boxes (on the original photo) for each photo read, kept for training labels.
const photoInfo = new Map<string, { width: number; height: number; boxes: Box[] }>();
export function boxesFor(uri: string) {
  return photoInfo.get(uri);
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
  const upright = await recognize(uri);
  set.add(upright);
  for (const b of upright) {
    const x = toBox(b);
    if (x) boxes.push(x);
  }
  let size: { width: number; height: number } | undefined;
  try {
    const ref = await ImageManipulator.manipulate(uri).renderAsync();
    size = { width: ref.width, height: ref.height };
  } catch {
    // size unknown: skip rotation mapping and re-reading
  }
  const turnedText = new Map<Box, number>(); // box -> rotation it was readable at
  for (const degrees of opts.rotations) {
    try {
      const ref = await ImageManipulator.manipulate(uri).resize({ width: WORK_WIDTH }).rotate(degrees).renderAsync();
      const img = await ref.saveAsync({ compress: 0.9, format: SaveFormat.JPEG });
      const lines = await recognize(img.uri);
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
        set.add(await recognize(img.uri));
      } catch {
        // Re-reading is a bonus; ignore failures.
      }
    }
  }
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

export function isNotLinkedError(e: unknown): boolean {
  return String(e).includes('linked');
}
