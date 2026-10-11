import TextRecognition from '@react-native-ml-kit/text-recognition';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { OcrLine } from './label.ts';

async function recognize(uri: string): Promise<OcrLine[]> {
  const res = await TextRecognition.recognize(uri);
  const out: OcrLine[] = [];
  for (const block of res.blocks) {
    for (const line of block.lines) out.push({ text: line.text, height: line.frame?.height, top: line.frame?.top, left: line.frame?.left });
  }
  return out;
}

/** Reads text from a photo on the device, one entry per printed line, with its text height. */
export async function readLines(uri: string): Promise<OcrLine[]> {
  return recognize(uri);
}

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

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

async function readRotations(uri: string, set: LineSet, degreesList: number[]) {
  set.add(await recognize(uri));
  for (const degrees of degreesList) {
    try {
      const ref = await ImageManipulator.manipulate(uri).resize({ width: 1600 }).rotate(degrees).renderAsync();
      const img = await ref.saveAsync({ compress: 0.9, format: SaveFormat.JPEG });
      set.add(await recognize(img.uri));
    } catch {
      // Rotation is a best effort; the upright reading is still used.
    }
  }
}

/**
 * Medicine strips print text in several directions (half the Clopilet strip is upside down).
 * Reads the photo upright, sideways and upside down and combines everything that was read.
 */
export async function readLinesAnyOrientation(uri: string): Promise<OcrLine[]> {
  const set = new LineSet();
  await readRotations(uri, set, [180, 90, 270]);
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
    // Every orientation for the first photo; upright and upside down for the rest (keeps it quick).
    await readRotations(uris[i], set, i === 0 ? [180, 90, 270] : [180]);
  }
  return set.lines;
}

export function isNotLinkedError(e: unknown): boolean {
  return String(e).includes('linked');
}
