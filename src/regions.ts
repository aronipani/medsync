// Region boxes on a strip photo: where the brand, contents and strength are printed.
// Used to (1) crop and re-read those areas and (2) auto-label photos for training a YOLO detector
// with rotated boxes (YOLO-OBB), because strips are photographed at any angle.
// Pure — no React Native — so it can be unit tested.

import { parseExpiry } from './expiry.ts';

export type RegionClass = 'brand' | 'contents' | 'strength' | 'expiry';
export const REGION_CLASSES: RegionClass[] = ['brand', 'contents', 'strength', 'expiry']; // YOLO class ids 0, 1, 2, 3

export interface Box {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  /** The text line's four corners on the photo, in reading order (top-left, top-right, bottom-right, bottom-left) — tilted when the strip is. */
  corners?: Point[];
}

export interface Point {
  x: number;
  y: number;
}

export interface Region extends Box {
  cls: RegionClass;
}

/** Box from text read on a rotated copy (resized to `w1` wide, then rotated clockwise) back onto the original photo. */
export function unrotateBox(b: Box, degrees: number, orig: { width: number; height: number }, w1: number): Box {
  const s = orig.width / w1;
  const h1 = orig.height / s;
  let l = b.left;
  let t = b.top;
  let w = b.width;
  let h = b.height;
  if (degrees === 90) [l, t, w, h] = [b.top, h1 - b.left - b.width, b.height, b.width];
  else if (degrees === 270) [l, t, w, h] = [w1 - b.top - b.height, b.left, b.height, b.width];
  else if (degrees === 180) [l, t] = [w1 - b.left - b.width, h1 - b.top - b.height];
  const back = (p: Point): Point => {
    const [x, y] = degrees === 90 ? [p.y, h1 - p.x] : degrees === 270 ? [w1 - p.y, p.x] : degrees === 180 ? [w1 - p.x, h1 - p.y] : [p.x, p.y];
    return { x: x * s, y: y * s };
  };
  return { text: b.text, left: l * s, top: t * s, width: w * s, height: h * s, ...(b.corners ? { corners: b.corners.map(back) } : {}) };
}

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
const words = (s: string) => s.toUpperCase().replace(/[®™©Ⓡ]/g, ' ').split(/[^A-Z0-9.]+/).filter(Boolean);

function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** A word from the photo that is (a readable or torn piece of) the target word. */
function wordMatches(seen: string, target: string, allowGlued = false): boolean {
  const a = norm(seen).replace(/\d+$/, ''); // "MONOTRATE10" -> "MONOTRATE"
  const b = norm(target);
  if (a.length < 3 || b.length < 3) return false;
  if (a === b) return true;
  if (a.length >= 4 && b.endsWith(a)) return true; // torn left edge: "OTRATE"
  if (a.length >= 4 && b.startsWith(a)) return true; // cut right edge
  if (a.length >= 5 && a.length < b.length && (editDistance(a, b.slice(-a.length)) <= 1 || editDistance(a, b.slice(0, a.length)) <= 1)) return true; // torn + misread: "PPILET"
  const tol = b.length >= 8 ? 2 : b.length >= 5 ? 1 : 0;
  if (Math.abs(a.length - b.length) <= tol && editDistance(a, b) <= tol) return true;
  // glued to other words: "ENTLOCLOPICTOGRE" contains (nearly) "CLOPIDOGREL"
  if (allowGlued && b.length >= 7 && a.length > b.length) {
    for (const n of [b.length - 1, b.length]) for (let i = 0; i + n <= a.length; i++) if (editDistance(a.slice(i, i + n), b) <= 2) return true;
  }
  return false;
}

function iou(a: Box, b: Box): number {
  const x0 = Math.max(a.left, b.left);
  const y0 = Math.max(a.top, b.top);
  const x1 = Math.min(a.left + a.width, b.left + b.width);
  const y1 = Math.min(a.top + a.height, b.top + b.height);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

/** The same print read in several orientations gives near-identical boxes: keep one per class (the larger). */
export function dedupeRegions(regions: Region[], threshold = 0.4): Region[] {
  const kept: Region[] = [];
  for (const r of [...regions].sort((a, b) => b.width * b.height - a.width * a.height)) {
    if (!kept.some((k) => k.cls === r.cls && iou(k, r) > threshold)) kept.push(r);
  }
  return kept;
}

// Ordinary label words that a torn or misread brand can look like ("INDIA" ~ "kerENDIA"): never the brand unless spelt exactly.
const COMMON_WORDS = new Set(['INDIA', 'TABLET', 'TABLETS', 'CAPSULE', 'CAPSULES', 'COATED', 'FILM', 'EACH', 'CONTAINS', 'LIMITED', 'PHARMA', 'PHARMACEUTICALS', 'LABORATORIES', 'VILLAGE', 'GERMANY', 'MUMBAI', 'DOSAGE', 'EXCIPIENTS', 'COLOURS', 'COLORS', 'PROTECTED', 'MOISTURE', 'LIGHT', 'TEMPERATURE', 'EXPORTS', 'AFFILIATES', 'MICRONIZED', 'EQUIVALENT']);
const SKIP = /\b(caution|schedule|prescription|retail|sold|practitioner|registered|trade\s?mark|manufactured|marketed|ltd|limited|pvt|road|dist|vill|batch|b\.?\s?no|mfg|exp|m\.?\s?r\.?\s?p|price|taxes|store|storage|dosage|directed|physician|children)\b/i;
const CONTENTS_HINT = /(\bcontains|\bequivalent|composition|tablets?\s+i\.?p|capsules?\s+i\.?p|tablets?\s+b\.?p|tablets?\s+u\.?s\.?p|hydrochloride|sodium|bisulphate)\b/i;

/**
 * Which OCR lines are the brand, the contents, the strength and the expiry date — given what the strip was confirmed to be.
 * The expiry box is any line with a readable "EXP 03/2028"-style date (spec 05); it doesn't depend on the label.
 * A line can be in two classes (e.g. "Isosorbide Mononitrate 10 mg" is contents and strength).
 */
export function labelRegions(lines: Box[], label: { name: string; strength: string; ingredients?: string[] }): Region[] {
  const brandWords = words(label.name).filter((w) => /[A-Z]{3,}/.test(w));
  const ingredientWords = (label.ingredients ?? []).flatMap(words).filter((w) => w.length >= 5 && /^[A-Z]+$/.test(w));
  const strengths = label.strength
    .split('/')
    .map((x) => x.replace(/[^\d.]/g, ''))
    .filter(Boolean);
  const out: Region[] = [];
  for (const l of lines) {
    if (!l.text.trim() || l.width <= 0 || l.height <= 0) continue;
    // Checked before SKIP, which drops "Exp"/"Mfg" lines from the other classes.
    if (parseExpiry(l.text)) out.push({ ...l, cls: 'expiry' });
    if (SKIP.test(l.text)) continue;
    const ws = words(l.text);
    // "MONONITRATE" is close to "MONOTRATE": a word that is (nearly) an ingredient word is not the brand.
    // Fragments that fit a contents word ("CLOPE" of Clopidogrel) are contents, never the brand.
    const isIngredientWord = (w: string) =>
      ingredientWords.some((g) => {
        const a = norm(w);
        return a === g || (a.length >= 6 && editDistance(a, g) <= 1) || (a.length >= 5 && a.length < g.length && editDistance(a, g.slice(0, a.length)) <= 1);
      });
    const hasBrand =
      brandWords.length > 0 && brandWords.some((b) => ws.some((w) => !isIngredientWord(w) && (norm(w).replace(/\d+$/, '') === b || (!COMMON_WORDS.has(norm(w)) && wordMatches(w, b)))));
    const hasIngredient = ingredientWords.some((g) => ws.some((w) => wordMatches(w, g, true)));
    const strengthHere =
      strengths.length > 0 &&
      strengths.some((s) => new RegExp(`(^|[^\\d.])${s.replace('.', '\\.')}\\s*(mg|mcg|µg|ml|iu|k)?\\b`, 'i').test(l.text.replace(/[®Ⓡ]/g, ' ')));
    if (hasBrand) out.push({ ...l, cls: 'brand' });
    if (!hasBrand && (hasIngredient || CONTENTS_HINT.test(l.text))) out.push({ ...l, cls: 'contents' });
    if (strengthHere && /\d\s*(mg|mcg|µg|ml|iu)\b/i.test(l.text)) out.push({ ...l, cls: 'strength' });
  }
  return dedupeRegions(out);
}

/** The four corners of a box: the read line's own (tilted) corners when known, else its upright rectangle. */
export function cornersOf(b: Box): Point[] {
  if (b.corners && b.corners.length === 4) return b.corners;
  const { left: l, top: t, width: w, height: h } = b;
  return [{ x: l, y: t }, { x: l + w, y: t }, { x: l + w, y: t + h }, { x: l, y: t + h }];
}

/** YOLO-OBB label lines: "class x1 y1 x2 y2 x3 y3 x4 y4", corners relative to the photo size. */
export function toYolo(regions: Region[], img: { width: number; height: number }): string {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const f = (v: number) => v.toFixed(6);
  return regions
    .filter((r) => r.width > 0 && r.height > 0)
    .map((r) => `${REGION_CLASSES.indexOf(r.cls)} ${cornersOf(r).map((p) => `${f(clamp(p.x / img.width))} ${f(clamp(p.y / img.height))}`).join(' ')}`)
    .join('\n');
}

/**
 * Areas worth cropping and reading again when no label is known yet (a dose check):
 * the largest print (usually the brand) and lines with a strength in them.
 */
export function rereadCandidates(lines: Box[], max = 4): Box[] {
  const usable = lines.filter((l) => l.width > 0 && l.height > 0 && !SKIP.test(l.text));
  const big = [...usable].sort((a, b) => b.height - a.height).slice(0, 2);
  const strength = usable.filter((l) => /\d\s*(mg|mcg|ml|iu)\b/i.test(l.text) || /[A-Z]{3,}[®Ⓡ]?\s?\d/.test(l.text));
  const pick: Box[] = [];
  for (const b of [...big, ...strength]) if (!pick.includes(b) && pick.length < max) pick.push(b);
  return pick;
}

/** A crop rectangle around a box with margin, kept inside the photo. */
export function padBox(b: Box, img: { width: number; height: number }, pad = 0.35): { originX: number; originY: number; width: number; height: number } {
  const px = Math.max(b.height * 1.2, b.width * pad * 0.25);
  const py = b.height * pad * 1.6;
  const x0 = Math.max(0, Math.floor(b.left - px));
  const y0 = Math.max(0, Math.floor(b.top - py));
  const x1 = Math.min(img.width, Math.ceil(b.left + b.width + px));
  const y1 = Math.min(img.height, Math.ceil(b.top + b.height + py));
  return { originX: x0, originY: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) };
}
