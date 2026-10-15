// Decoding the strip-region detector's output (YOLO11n-OBB, rotated boxes) and mapping boxes back onto the photo.
// Pure — no React Native — so it can be unit tested. See docs/specs/10-region-detector-and-text-readers.md.
//
// The model is exported without built-in NMS. Its output is one tensor of shape [1, 4 + classes + 1, anchors]:
// for each anchor the box centre x, y, width, height (0…1 of the model input), one score per class, then the
// angle in radians. Boxes are kept above a confidence threshold and overlapping boxes of the same class are
// reduced to the best one (rotated-box NMS).

import { REGION_CLASSES, type Point, type RegionClass } from './regions.ts';

export interface Detection {
  cls: RegionClass;
  score: number;
  /** Centre, size and angle in model-input pixels; `w` runs along the angle. */
  cx: number;
  cy: number;
  w: number;
  h: number;
  angle: number; // radians, clockwise in image coordinates (y down)
}

export interface Letterbox {
  scale: number; // photo pixels × scale = model pixels
  padX: number;
  padY: number;
  size: number; // model input side
}

/** How a photo of `w`×`h` is fitted into the square model input: scaled to fit, centred, padded. */
export function letterbox(w: number, h: number, size: number): Letterbox {
  const scale = Math.min(size / w, size / h);
  return { scale, padX: Math.round((size - w * scale) / 2), padY: Math.round((size - h * scale) / 2), size };
}

/**
 * Reads the raw output. `shape` is the output tensor's shape: [1, C, N] (channels first, how Ultralytics exports)
 * or [1, N, C]. Coordinates may be normalised (0…1, TFLite export) or in pixels — values ≤ 2 are taken as normalised.
 */
export function decodeObb(
  out: ArrayLike<number>,
  shape: number[],
  inputSize: number,
  opts: { conf?: number; iou?: number; maxDet?: number } = {},
): Detection[] {
  const nc = REGION_CLASSES.length;
  const C = 4 + nc + 1;
  const [, a, b] = shape.length === 3 ? shape : [1, shape[0], shape[1]];
  const channelsFirst = a === C;
  if (!channelsFirst && b !== C) throw new Error(`Unexpected detector output shape [${shape.join(', ')}] for ${nc} classes`);
  const N = channelsFirst ? b : a;
  const at = (ch: number, i: number) => (channelsFirst ? out[ch * N + i] : out[i * C + ch]);
  const conf = opts.conf ?? 0.25;

  // Normalised or pixels? Look at the box sizes of confident anchors.
  let maxCoord = 0;
  const raw: Detection[] = [];
  for (let i = 0; i < N; i++) {
    let best = 0;
    let cls = 0;
    for (let c = 0; c < nc; c++) {
      const s = at(4 + c, i);
      if (s > best) {
        best = s;
        cls = c;
      }
    }
    if (best < conf) continue;
    const d = { cls: REGION_CLASSES[cls], score: best, cx: at(0, i), cy: at(1, i), w: at(2, i), h: at(3, i), angle: at(4 + nc, i) };
    maxCoord = Math.max(maxCoord, d.cx, d.cy);
    raw.push(d);
  }
  if (maxCoord <= 2) for (const d of raw) [d.cx, d.cy, d.w, d.h] = [d.cx * inputSize, d.cy * inputSize, d.w * inputSize, d.h * inputSize];
  return nmsRotated(raw, opts.iou ?? 0.45, opts.maxDet ?? 100);
}

/** The four corners of a rotated box, in order: start of the text line, then clockwise. */
export function corners(d: Pick<Detection, 'cx' | 'cy' | 'w' | 'h' | 'angle'>): Point[] {
  const c = Math.cos(d.angle);
  const s = Math.sin(d.angle);
  const dx = { x: (c * d.w) / 2, y: (s * d.w) / 2 }; // half the width, along the angle
  const dy = { x: (-s * d.h) / 2, y: (c * d.h) / 2 }; // half the height, across it
  return [
    { x: d.cx - dx.x - dy.x, y: d.cy - dx.y - dy.y },
    { x: d.cx + dx.x - dy.x, y: d.cy + dx.y - dy.y },
    { x: d.cx + dx.x + dy.x, y: d.cy + dx.y + dy.y },
    { x: d.cx - dx.x + dy.x, y: d.cy - dx.y + dy.y },
  ];
}

function area(p: Point[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Overlap of two convex polygons (Sutherland–Hodgman clipping). */
function intersection(subject: Point[], clip: Point[]): Point[] {
  const sign = area2(clip) >= 0 ? 1 : -1; // works for either winding
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const inside = (p: Point) => sign * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) >= 0;
    const cross = (p: Point, q: Point): Point => {
      const a1 = b.y - a.y;
      const b1 = a.x - b.x;
      const c1 = a1 * a.x + b1 * a.y;
      const a2 = q.y - p.y;
      const b2 = p.x - q.x;
      const c2 = a2 * p.x + b2 * p.y;
      const det = a1 * b2 - a2 * b1;
      return det === 0 ? p : { x: (b2 * c1 - b1 * c2) / det, y: (a1 * c2 - a2 * c1) / det };
    };
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j];
      const q = input[(j + 1) % input.length];
      if (inside(q)) {
        if (!inside(p)) out.push(cross(p, q));
        out.push(q);
      } else if (inside(p)) out.push(cross(p, q));
    }
  }
  return out;
}

function area2(p: Point[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) s += p[i].x * p[(i + 1) % p.length].y - p[(i + 1) % p.length].x * p[i].y;
  return s;
}

/** Intersection over union of two rotated boxes. */
export function iouRotated(a: Detection, b: Detection): number {
  const pa = corners(a);
  const pb = corners(b);
  const inter = area(intersection(pa, pb));
  const union = area(pa) + area(pb) - inter;
  return union > 0 ? inter / union : 0;
}

/** Keeps the best box among same-class boxes that overlap more than `iou`. */
export function nmsRotated(dets: Detection[], iou = 0.45, maxDet = 100): Detection[] {
  const kept: Detection[] = [];
  for (const d of [...dets].sort((x, y) => y.score - x.score)) {
    if (kept.length >= maxDet) break;
    if (!kept.some((k) => k.cls === d.cls && iouRotated(k, d) > iou)) kept.push(d);
  }
  return kept;
}

export interface PhotoRegion {
  cls: RegionClass;
  score: number;
  corners: Point[]; // on the photo, in photo pixels
  /** Clockwise turn (degrees) of the text line; rotating the crop by minus this makes the text level. */
  angleDeg: number;
  /** Length of the text line and its height, in photo pixels. */
  length: number;
  height: number;
}

/** A detection on the model input back onto the original photo. The long side of the box is the text line. */
export function toPhoto(d: Detection, lb: Letterbox): PhotoRegion {
  const back = (p: Point): Point => ({ x: (p.x - lb.padX) / lb.scale, y: (p.y - lb.padY) / lb.scale });
  // Make `w` the long side, so the angle is the direction the text runs.
  const turned = d.w >= d.h ? d : { ...d, w: d.h, h: d.w, angle: d.angle + Math.PI / 2 };
  let deg = (turned.angle * 180) / Math.PI;
  deg = ((((deg + 90) % 180) + 180) % 180) - 90; // -90…90: the 180° ambiguity is resolved by reading both ways
  return { cls: d.cls, score: d.score, corners: corners(turned).map(back), angleDeg: deg, length: turned.w / lb.scale, height: turned.h / lb.scale };
}

/**
 * The upright rectangle to crop for a region (padded, kept inside the photo), and how far to turn the crop
 * to make the text level.
 */
export function cropFor(r: PhotoRegion, img: { width: number; height: number }, pad = 0.25): { originX: number; originY: number; width: number; height: number; rotate: number } {
  const xs = r.corners.map((p) => p.x);
  const ys = r.corners.map((p) => p.y);
  const m = Math.max(r.height * 0.6, Math.min(r.length, r.height) * pad, 8);
  const x0 = Math.max(0, Math.floor(Math.min(...xs) - m));
  const y0 = Math.max(0, Math.floor(Math.min(...ys) - m));
  const x1 = Math.min(img.width, Math.ceil(Math.max(...xs) + m));
  const y1 = Math.min(img.height, Math.ceil(Math.max(...ys) + m));
  return { originX: x0, originY: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0), rotate: -r.angleDeg };
}

/**
 * Fills the model input (size×size×3, RGB, 0…1) from decoded RGBA pixels of a photo already scaled to fit
 * (`w`×`h` ≤ size), centred with grey padding — the same letterbox Ultralytics trains with.
 */
export function toInput(rgba: ArrayLike<number>, w: number, h: number, size: number): { data: Float32Array; lb: Letterbox } {
  const lb = letterbox(w, h, size);
  // The photo is already scaled; only the padding applies here.
  const padX = Math.round((size - w) / 2);
  const padY = Math.round((size - h) / 2);
  const data = new Float32Array(size * size * 3).fill(114 / 255);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      const t = ((y + padY) * size + (x + padX)) * 3;
      data[t] = rgba[s] / 255;
      data[t + 1] = rgba[s + 1] / 255;
      data[t + 2] = rgba[s + 2] / 255;
    }
  }
  return { data, lb: { ...lb, scale: 1, padX, padY } };
}

/** The areas worth reading: the best brand and strength boxes, then contents and expiry. */
export function pickRegions(regions: PhotoRegion[], minScore = 0.35): PhotoRegion[] {
  const quota = { brand: 2, strength: 2, contents: 1, expiry: 1 };
  const out: PhotoRegion[] = [];
  for (const r of [...regions].sort((a, b) => b.score - a.score)) {
    if (r.score < minScore || quota[r.cls] <= 0) continue;
    quota[r.cls]--;
    out.push(r);
  }
  return out;
}
