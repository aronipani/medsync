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
  assert.deepEqual(by('brand').sort(), ['MONOTRATE®10', 'OTRATE®10']);
  assert.deepEqual(by('contents').sort(), ['Each uncoated tablet contains:', 'Isosorbide Mononitrate   10 mg', 'Isosorbide Mononitrate Tablets IP']);
  assert.deepEqual(by('strength'), ['Isosorbide Mononitrate   10 mg']);
});

test('YOLO-OBB output: four relative corners per box, tilted corners when known', () => {
  const tilted = { ...B('Z', 100, 100, 300, 300), corners: [{ x: 100, y: 300 }, { x: 300, y: 100 }, { x: 400, y: 200 }, { x: 200, y: 400 }], cls: 'contents' as const };
  const y = toYolo([{ ...B('X', 100, 50, 200, 100), cls: 'brand' }, { ...B('Y', 0, 0, 1000, 1000), cls: 'strength' }, tilted], { width: 1000, height: 500 });
  assert.equal(
    y,
    '0 0.100000 0.100000 0.300000 0.100000 0.300000 0.300000 0.100000 0.300000\n' +
      '2 0.000000 0.000000 1.000000 0.000000 1.000000 1.000000 0.000000 1.000000\n' +
      '1 0.100000 0.600000 0.300000 0.200000 0.400000 0.400000 0.200000 0.800000',
  );
});

test('tilted corners read on rotated copies map back onto the photo', () => {
  const orig = { width: 3000, height: 4000 };
  const w1 = 1600;
  const s = orig.width / w1;
  const h1 = orig.height / s;
  const p = { x: 900, y: 1200 }; // a corner on the original photo
  const q = { x: p.x / s, y: p.y / s }; // on the resized copy
  // the same point on each clockwise-rotated copy
  const on = { 90: { x: h1 - q.y, y: q.x }, 180: { x: w1 - q.x, y: h1 - q.y }, 270: { x: q.y, y: w1 - q.x } } as const;
  for (const deg of [90, 180, 270] as const) {
    const back = unrotateBox({ ...B('t', 0, 0, 1, 1), corners: [on[deg], on[deg], on[deg], on[deg]] }, deg, orig, w1);
    assert.ok(Math.abs(back.corners![0].x - p.x) < 0.01 && Math.abs(back.corners![0].y - p.y) < 0.01, `${deg}: ${JSON.stringify(back.corners![0])}`);
  }
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

test('torn + misread brand, glued generic, and duplicate boxes from rotations', async () => {
  const lines = [
    B('ppilet', 917, 1744, 60, 190),
    B('entloClopictogre', 445, 1758, 44, 233), // 3 letters off: too far to trust
    B('equivalentto Clope', 1073, 1825, 27, 278), // cut at the photo edge
    B('equivalent to Clopidogrel 75 mg', 100, 100, 400, 30),
  ];
  const r = labelRegions(lines, { name: 'Clopilet', strength: '75', ingredients: ['Clopidogrel'] });
  assert.deepEqual(r.map((x) => [x.cls, x.text]).sort(), [
    ['brand', 'ppilet'],
    ['contents', 'equivalent to Clopidogrel 75 mg'],
    ['contents', 'equivalentto Clope'],
    ['strength', 'equivalent to Clopidogrel 75 mg'],
  ]);
  const dup = labelRegions([B('NEBICARD-2.5', 193, 980, 444, 46), B('NEBICARD-2.5', 196, 976, 443, 54)], { name: 'Nebicard', strength: '2.5' });
  assert.equal(dup.length, 1);
});
