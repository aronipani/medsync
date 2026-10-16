// What each step of a strip scan saw, kept with training photos so a failed scan shows WHICH step failed:
// the region detector (did it find the brand / strength boxes?) or the text reader (did it misread them?).
// Pure — no React Native — so it can be unit tested. See docs/specs/12-strip-scan-pipeline.md.

import { REGION_CLASSES, type Point, type RegionClass } from './regions.ts';
import type { PhotoRegion } from './obb.ts';

/** One reading of the photo or of a crop of it. */
export interface TraceStep {
  step: string; // "whole photo, upright", "brand area (0.62), level", "re-read: biggest print"…
  reader: string; // "apple-vision" | "ml-kit"
  lines: string[]; // the text read, one entry per line (capped)
  ms?: number;
}

/** A box the detector found, relative to the photo (0…1) so it stays valid when the photo is resized. */
export interface TraceRegion {
  cls: RegionClass;
  score: number;
  corners: Point[];
  picked: boolean; // cropped and read
}

/**
 * What the detector did on this photo:
 * off (switched off) · missing (not in this build / failed to run) · nothing (no area worth reading) ·
 * extra (areas read, and the whole photo also read every way up) · used (name and strength read from areas; the
 * every-way-up reading was skipped).
 */
export type DetectorOutcome = 'off' | 'missing' | 'nothing' | 'extra' | 'used';

export interface ScanTrace {
  width: number;
  height: number;
  detector: DetectorOutcome;
  regions: TraceRegion[];
  steps: TraceStep[];
}

const MAX_LINES = 60;
const MAX_CHARS = 120;

export function newTrace(width: number, height: number): ScanTrace {
  return { width, height, detector: 'off', regions: [], steps: [] };
}

export function addStep(trace: ScanTrace, step: string, reader: string, lines: string[], ms?: number) {
  trace.steps.push({ step, reader, lines: lines.slice(0, MAX_LINES).map((l) => l.slice(0, MAX_CHARS)), ...(ms !== undefined ? { ms } : {}) });
}

export function addRegions(trace: ScanTrace, regions: PhotoRegion[], picked: PhotoRegion[]) {
  const rel = (p: Point): Point => ({ x: round4(p.x / trace.width), y: round4(p.y / trace.height) });
  trace.regions = regions.map((r) => ({ cls: r.cls, score: round4(r.score), corners: r.corners.map(rel), picked: picked.includes(r) }));
}

const round4 = (v: number) => Math.round(v * 10000) / 10000;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * The detector's boxes as YOLO-OBB lines with the confidence last ("cls x1 y1 … x4 y4 score"), the format CVAT and
 * Ultralytics read as predictions — so a failed scan's boxes can be loaded, corrected and used as labels.
 */
export function regionsToYolo(trace: Pick<ScanTrace, 'regions'>): string {
  return trace.regions
    .map((r) => [REGION_CLASSES.indexOf(r.cls), ...r.corners.flatMap((p) => [clamp01(p.x), clamp01(p.y)]).map((v) => v.toFixed(6)), r.score.toFixed(4)].join(' '))
    .join('\n');
}

const DETECTOR_TEXT: Record<DetectorOutcome, string> = {
  off: 'switched off',
  missing: 'not available in this build',
  nothing: 'found no area worth reading',
  extra: 'areas read, plus the whole photo every way up',
  used: 'name and strength read from its areas (every-way-up reading skipped)',
};

/** A readable account of the scan, for checking a failed one by eye. */
export function describeTrace(trace: ScanTrace, header: string[] = []): string {
  const out = [...header];
  out.push(`Region detector: ${DETECTOR_TEXT[trace.detector]}`);
  for (const r of [...trace.regions].sort((a, b) => b.score - a.score)) out.push(`  ${r.picked ? '•' : ' '} ${r.cls.padEnd(8)} ${r.score.toFixed(2)}${r.picked ? '  (cropped and read)' : ''}`);
  if (!trace.regions.length && trace.detector !== 'off' && trace.detector !== 'missing') out.push('  (no boxes)');
  trace.steps.forEach((s, i) => {
    out.push('', `Step ${i + 1}: ${s.step} — ${s.reader === 'apple-vision' ? 'Apple Vision' : 'ML Kit'}${s.ms !== undefined ? `, ${s.ms} ms` : ''}`);
    out.push(...(s.lines.length ? s.lines.map((l) => `  ${l}`) : ['  (nothing read)']));
  });
  return out.join('\n') + '\n';
}

const SVG_COLORS: Record<RegionClass, string> = { brand: '#28A028', contents: '#0078C8', strength: '#DC1E1E', expiry: '#B428B4' };
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The photo with the detector's boxes drawn on it, and the text of every step beside it, as an SVG that shows the
 * exported JPEG by relative path (no copy of the photo inside). Opens in any browser. Made on the phone, where
 * drawing onto the JPEG itself isn't available. Picked (cropped-and-read) boxes are solid, others dashed.
 */
export function traceSvg(trace: ScanTrace, imageHref: string, header: string[] = []): string {
  const W = 1280;
  const H = Math.round((W * trace.height) / Math.max(1, trace.width));
  const panel = 760;
  const sw = Math.max(3, Math.round(W / 320));
  const boxes = trace.regions
    .map((r) => {
      const pts = r.corners.map((p) => `${(p.x * W).toFixed(1)},${(p.y * H).toFixed(1)}`).join(' ');
      const c = SVG_COLORS[r.cls];
      const [x, y] = [r.corners[0].x * W, Math.max(22, r.corners[0].y * H - 6)];
      return (
        `<polygon points="${pts}" fill="none" stroke="${c}" stroke-width="${sw}"${r.picked ? '' : ` stroke-dasharray="${sw * 3} ${sw * 2}"`}/>` +
        `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="${c}" font-size="22" font-weight="700" paint-order="stroke" stroke="#fff" stroke-width="4">${r.cls} ${r.score.toFixed(2)}</text>`
      );
    })
    .join('\n');
  const lines = describeTrace(trace, header).trimEnd().split('\n');
  const text = lines
    .map((l, i) => {
      const bold = /^(Step|Region|Medicine|Photo)/.test(l);
      return `<text x="${W + 16}" y="${30 + i * 24}" font-size="17" font-family="Menlo, Consolas, monospace" xml:space="preserve"${bold ? ' font-weight="700"' : ''}>${esc(l.slice(0, 70))}</text>`;
    })
    .join('\n');
  const height = Math.max(H, 40 + lines.length * 24);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W + panel} ${height}" width="${W + panel}" height="${height}">`,
    `<rect width="100%" height="100%" fill="#fff"/>`,
    `<image href="${esc(imageHref)}" xlink:href="${esc(imageHref)}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none"/>`,
    boxes,
    text,
    '</svg>',
    '',
  ].join('\n');
}
