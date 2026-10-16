import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addRegions, addStep, describeTrace, newTrace, regionsToYolo, traceSvg } from '../src/scanTrace.ts';
import { toPhoto } from '../src/obb.ts';

const lb = { scale: 1, padX: 0, padY: 0, size: 640 };
const region = (cls: 'brand' | 'strength', score: number, cx: number, cy: number) => toPhoto({ cls, score, cx, cy, w: 200, h: 40, angle: 0 }, lb);

test('detector boxes are kept relative to the photo and written as YOLO-OBB predictions with confidence', () => {
  const t = newTrace(1000, 500);
  const brand = region('brand', 0.62, 500, 250);
  const strength = region('strength', 0.3, 100, 50);
  addRegions(t, [brand, strength], [brand]);
  assert.deepEqual(t.regions.map((r) => [r.cls, r.picked]), [['brand', true], ['strength', false]]);
  assert.deepEqual(t.regions[0].corners[0], { x: 0.4, y: 0.46 });
  const lines = regionsToYolo(t).split('\n');
  assert.equal(lines[0], '0 0.400000 0.460000 0.600000 0.460000 0.600000 0.540000 0.400000 0.540000 0.6200');
  assert.ok(lines[1].startsWith('2 0.000000 ')); // strength box past the left edge is clamped
});

test('steps keep the text read (capped), and the account says which step read what', () => {
  const t = newTrace(1000, 500);
  t.detector = 'extra';
  addRegions(t, [region('brand', 0.62, 500, 250)], []);
  addStep(t, 'whole photo, upright', 'apple-vision', ['SCHEDULE H', 'x'.repeat(300)], 812);
  addStep(t, 'brand area (0.62), level', 'ml-kit', []);
  assert.equal(t.steps[0].lines[1].length, 120);
  const text = describeTrace(t, ['Medicine: (not known)']);
  assert.match(text, /^Medicine: \(not known\)\nRegion detector: areas read, plus the whole photo every way up/);
  assert.match(text, /Step 1: whole photo, upright — Apple Vision, 812 ms\n {2}SCHEDULE H/);
  assert.match(text, /Step 2: brand area \(0\.62\), level — ML Kit\n {2}\(nothing read\)/);
});

test('no boxes found is said plainly; nothing to predict', () => {
  const t = newTrace(10, 10);
  t.detector = 'nothing';
  assert.equal(regionsToYolo(t), '');
  assert.match(describeTrace(t), /found no area worth reading\n {2}\(no boxes\)/);
});

test('boxed copy: an SVG showing the exported photo by relative path, boxes on it, step text beside it', () => {
  const t = newTrace(1000, 500);
  t.detector = 'extra';
  const brand = region('brand', 0.62, 500, 250);
  addRegions(t, [brand, region('strength', 0.3, 300, 100)], [brand]);
  addStep(t, 'whole photo, upright', 'ml-kit', ['A & B <75 mg>']);
  const svg = traceSvg(t, '../unlabelled/x.jpg', ['Medicine: (not known)']);
  assert.match(svg, /viewBox="0 0 2040 \d+"/);
  assert.match(svg, /<image href="\.\.\/unlabelled\/x\.jpg"[^>]* width="1280" height="640"/);
  assert.match(svg, /points="512\.0,294\.4 768\.0,294\.4 768\.0,345\.6 512\.0,345\.6" fill="none" stroke="#28A028" stroke-width="4"\/>/); // picked: solid
  assert.match(svg, /stroke="#DC1E1E" stroke-width="4" stroke-dasharray/); // not picked: dashed
  assert.match(svg, /A &amp; B &lt;75 mg&gt;/);
});
