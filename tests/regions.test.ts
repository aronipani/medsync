import { test } from 'node:test';
import assert from 'node:assert/strict';
import { labelRegions, padBox, rereadCandidates, toYolo, unrotateBox } from '../src/regions.ts';

const B = (text: string, left: number, top: number, width: number, height: number) => ({ text, left, top, width, height });

test('labels brand (even torn), contents and strength on a Monotrate strip', () => {
  const lines = [
    B('Isosorbide Mononitrate Tablets IP', 100, 50, 600, 40),
    B('MONOTRATE®10', 120, 110, 260, 36),
    B('OTRATE®10', 40, 400, 180, 30),
    B('Each uncoated tablet contains:', 100, 170, 400, 22),
    B('Isosorbide Mononitrate   10 mg', 100, 200, 420, 22),
    B('SCHEDULE H PRESCRIPTION DRUG - CAUTION', 700, 60, 300, 24),
    B('sun pharma laboratories ltd.', 700, 200, 300, 22),
    B('M.R.P.Rs.27.19', 1000, 300, 200, 22),
  ];
  const r = labelRegions(lines, { name: 'Monotrate', strength: '10', ingredients: ['Isosorbide Mononitrate'] });
  const by = (c: string) => r.filter((x) => x.cls === c).map((x) => x.text);
  assert.deepEqual(by('brand'), ['MONOTRATE®10', 'OTRATE®10']);
  assert.deepEqual(by('contents'), ['Isosorbide Mononitrate Tablets IP', 'Each uncoated tablet contains:', 'Isosorbide Mononitrate   10 mg']);
  assert.deepEqual(by('strength'), ['Isosorbide Mononitrate   10 mg']);
});

test('YOLO output is normalised centre/size per class', () => {
  const y = toYolo([{ ...B('X', 100, 50, 200, 100), cls: 'brand' }, { ...B('Y', 0, 0, 1000, 1000), cls: 'strength' }], { width: 1000, height: 500 });
  assert.equal(y, '0 0.200000 0.200000 0.200000 0.200000\n2 0.500000 0.500000 1.000000 1.000000');
});

test('boxes read on rotated copies map back onto the photo', () => {
  const orig = { width: 3000, height: 4000 };
  const w1 = 1600; // copies are resized to 1600 wide before rotating; h1 = 4000 * 1600/3000 = 2133.33
  const box = B('t', 300, 600, 900, 150); // on the original photo
  const s = orig.width / w1;
  const r = { l: box.left / s, t: box.top / s, w: box.width / s, h: box.height / s };
  const h1 = orig.height / s;
  // Where that box lands on each rotated copy (clockwise rotation):
  const rot180 = B('t', w1 - r.l - r.w, h1 - r.t - r.h, r.w, r.h);
  const rot90 = B('t', h1 - r.t - r.h, r.l, r.h, r.w);
  const rot270 = B('t', r.t, w1 - r.l - r.w, r.h, r.w);
  for (const [deg, b] of [[180, rot180], [90, rot90], [270, rot270]] as const) {
    const back = unrotateBox(b, deg, orig, w1);
    for (const k of ['left', 'top', 'width', 'height'] as const) assert.ok(Math.abs(back[k] - box[k]) < 0.01, `${deg} ${k} ${back[k]}`);
  }
});

test('re-read picks the biggest print and strength lines, and padded crops stay inside the photo', () => {
  const lines = [B('tiny', 0, 0, 50, 8), B('BRILLO EZ', 100, 100, 400, 60), B('Bempedoic Acid 180 mg', 100, 300, 300, 20), B('SCHEDULE H', 0, 500, 200, 70)];
  assert.deepEqual(rereadCandidates(lines).map((b) => b.text), ['BRILLO EZ', 'Bempedoic Acid 180 mg']);
  const c = padBox(B('edge', 5, 5, 100, 20), { width: 200, height: 100 });
  assert.equal(c.originX, 0);
  assert.equal(c.originY, 0);
  assert.ok(c.originX + c.width <= 200 && c.originY + c.height <= 100);
});
