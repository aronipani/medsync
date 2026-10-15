import { test } from 'node:test';
import assert from 'node:assert/strict';
import { corners, cropFor, decodeObb, iouRotated, letterbox, nmsRotated, pickRegions, toInput, toPhoto, type Detection } from '../src/obb.ts';

const D = (cls: Detection['cls'], score: number, cx: number, cy: number, w: number, h: number, angle = 0): Detection => ({ cls, score, cx, cy, w, h, angle });
const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

/** Builds a raw output tensor [1, 9, N] (channels first) from rows of [cx, cy, w, h, s0, s1, s2, s3, angle]. */
function tensor(rows: number[][]): { out: Float32Array; shape: number[] } {
  const C = 9;
  const N = rows.length;
  const out = new Float32Array(C * N);
  rows.forEach((r, i) => r.forEach((v, ch) => (out[ch * N + i] = v)));
  return { out, shape: [1, C, N] };
}

test('decodes channels-first output, scales normalised boxes to input pixels, drops weak anchors', () => {
  const { out, shape } = tensor([
    [0.5, 0.25, 0.4, 0.05, 0.9, 0.1, 0, 0, 0.1], // brand
    [0.5, 0.5, 0.3, 0.04, 0.05, 0.02, 0.8, 0, 0], // strength
    [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0], // below threshold
  ]);
  const d = decodeObb(out, shape, 640);
  assert.equal(d.length, 2);
  assert.equal(d[0].cls, 'brand');
  close(d[0].cx, 320, 1e-3);
  close(d[0].cy, 160, 1e-3);
  close(d[0].w, 256, 1e-3);
  close(d[0].angle, 0.1, 1e-6);
  assert.equal(d[1].cls, 'strength');
});

test('also reads [1, N, C] output and pixel coordinates', () => {
  const rows = [[300, 200, 120, 20, 0, 0.7, 0, 0, 0]];
  const out = new Float32Array(rows.flat());
  const d = decodeObb(out, [1, 1, 9], 640);
  assert.equal(d[0].cls, 'contents');
  close(d[0].cx, 300);
});

test('rejects an output that does not fit 4 classes', () => {
  assert.throws(() => decodeObb(new Float32Array(16), [1, 8, 2], 640));
});

test('rotated IoU: identical boxes 1, disjoint 0, the same box at 90° partly', () => {
  const a = D('brand', 1, 100, 100, 80, 20);
  close(iouRotated(a, a), 1, 1e-9);
  assert.equal(iouRotated(a, D('brand', 1, 400, 400, 80, 20)), 0);
  const cross = iouRotated(a, D('brand', 1, 100, 100, 80, 20, Math.PI / 2));
  close(cross, 400 / (1600 + 1600 - 400), 1e-6); // 20×20 overlap
});

test('NMS keeps the best of overlapping same-class boxes, but keeps other classes', () => {
  const kept = nmsRotated([D('brand', 0.6, 100, 100, 80, 20, 0.05), D('brand', 0.9, 102, 100, 80, 20), D('strength', 0.5, 100, 100, 80, 20)]);
  assert.deepEqual(
    kept.map((k) => [k.cls, k.score]),
    [
      ['brand', 0.9],
      ['strength', 0.5],
    ],
  );
});

test('corners follow the angle', () => {
  const c = corners({ cx: 0, cy: 0, w: 2, h: 0, angle: Math.PI / 2 });
  close(c[0].x, 0);
  close(c[0].y, -1);
  close(c[1].y, 1);
});

test('letterbox and back: a box on the model input lands on the photo, long side first', () => {
  const lb = letterbox(4000, 3000, 640); // landscape photo: padded top and bottom
  close(lb.scale, 0.16);
  assert.equal(lb.padX, 0);
  assert.equal(lb.padY, 80);
  // A vertical box on the input (text running down the strip).
  const r = toPhoto(D('brand', 0.8, 320, 320, 16, 160), lb);
  close(r.length, 1000);
  close(r.height, 100);
  close(Math.abs(r.angleDeg), 90); // straight down or up: read both ways anyway
  const xs = r.corners.map((p) => p.x);
  close(Math.min(...xs), 1950);
  close(Math.max(...xs), 2050);
});

test('crop is padded, kept inside the photo, and turns the text level', () => {
  const r = toPhoto(D('strength', 0.8, 20, 100, 100, 20, (30 * Math.PI) / 180), { scale: 1, padX: 0, padY: 0, size: 640 });
  const c = cropFor(r, { width: 500, height: 500 });
  assert.equal(c.originX, 0); // would go past the left edge
  assert.ok(c.originX + c.width > 68 + 10, 'padded past the right end of the text');
  assert.ok(c.originY < 66 && c.originY + c.height > 134, 'padded above and below');
  close(c.rotate, -30);
});

test('model input: photo centred with grey padding, RGB 0…1', () => {
  const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]); // 2×1 pixels
  const { data, lb } = toInput(rgba, 2, 1, 4);
  assert.equal(lb.padX, 1);
  assert.equal(lb.padY, 2); // round(1.5)
  const px = (x: number, y: number) => Array.from(data.slice((y * 4 + x) * 3, (y * 4 + x) * 3 + 3)).map((v) => Math.round(v * 255));
  assert.deepEqual(px(1, 2), [255, 0, 0]);
  assert.deepEqual(px(2, 2), [0, 255, 0]);
  assert.deepEqual(px(0, 0), [114, 114, 114]);
});

test('picks the best brand and strength areas first, within a quota, above the threshold', () => {
  const lb = { scale: 1, padX: 0, padY: 0, size: 640 };
  const R = (cls: Detection['cls'], score: number) => toPhoto(D(cls, score, 100, 100, 80, 20), lb);
  const picked = pickRegions([R('brand', 0.9), R('brand', 0.8), R('brand', 0.7), R('contents', 0.6), R('contents', 0.5), R('strength', 0.3), R('expiry', 0.5)]);
  assert.deepEqual(
    picked.map((r) => `${r.cls} ${r.score}`),
    ['brand 0.9', 'brand 0.8', 'contents 0.6', 'expiry 0.5'],
  );
});
