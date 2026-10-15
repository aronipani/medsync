import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmPair, contentsOf, findOverlaps, overlapMessage, overlapsFor, prescriptionOverlaps } from '../src/overlap.ts';
import type { Medication } from '../src/types.ts';

let n = 0;
const med = (name: string, strength: string, extra: Partial<Medication> = {}): Medication => ({
  id: `m${++n}`, memberId: 'ma', name, strength, aliases: [], barcodes: [], unit: 'tablet', doses: [], stock: 10, lowStockAt: 5,
  active: true, createdAt: '2026-10-01T00:00:00.000Z', ...extra,
});

test('two brands of clopidogrel at the same strength double the dose', () => {
  const [o] = findOverlaps([med('Clopilet', '75'), med('Clopitab', '75 mg')]);
  assert.equal(o.kind, 'same');
  assert.equal(o.sameStrength, true);
  assert.deepEqual(o.shared, ['Clopidogrel']);
  assert.equal(overlapMessage(o), 'Clopilet 75 and Clopitab 75 mg are the same medicine (clopidogrel). Taking both doubles the dose.');
});

test('same contents at different strengths, and a combination repeating a single', () => {
  const [t] = findOverlaps([med('Tide', '10'), med('Tide', '20')]);
  assert.equal(t.kind, 'same');
  assert.equal(t.sameStrength, false);
  assert.match(overlapMessage(t), /are both torsemide\. Check with your doctor/);
  const [c] = findOverlaps([med('Telma', '40'), med('Telma H', '40/12.5')]);
  assert.equal(c.kind, 'partial');
  assert.deepEqual(c.shared, ['Telmisartan']);
  assert.match(overlapMessage(c), /both contain telmisartan/);
});

test('generic names written on the medicine count', () => {
  assert.deepEqual(contentsOf(med('Clopidogrel Tablets IP', '75')), ['Clopidogrel']);
  assert.deepEqual(contentsOf(med('Heart tablet', '10', { aliases: ['Isosorbide Mononitrate 10'] })), ['Isosorbide Mononitrate']);
  assert.equal(findOverlaps([med('Clopidogrel Tablets IP', '75'), med('Clopilet', '75')]).length, 1);
});

test('no warning across people, for paused or unknown medicines, or once a doctor confirmed', () => {
  assert.equal(findOverlaps([med('Clopilet', '75'), med('Clopitab', '75', { memberId: 'baba' })]).length, 0);
  assert.equal(findOverlaps([med('Clopilet', '75'), med('Clopitab', '75', { active: false })]).length, 0);
  assert.equal(findOverlaps([med('Grandma tonic', '5'), med('Grandma tonic', '5')]).length, 0);
  assert.equal(findOverlaps([med('Monotrate', '10'), med('Clopilet', '75')]).length, 0);
  const [a, b] = confirmPair(med('Tide', '10'), med('Tide', '20'));
  assert.equal(findOverlaps([a, b]).length, 0);
  assert.equal(overlapsFor(med('Dytor', '10'), [a, b]).length, 2, 'a third torsemide still warns');
});

test('prescription check ignores medicines being replaced or stopped', () => {
  const clopilet = med('Clopilet', '75');
  const tide = med('Tide', '10');
  const items = [
    { id: 'i1', med: med('Clopitab', '75') }, // new brand while Clopilet stays → warn
    { id: 'i2', med: med('Dytor', '10'), targetId: tide.id }, // replaces Tide → no warning
  ];
  const r = prescriptionOverlaps(items, [clopilet, tide]);
  assert.deepEqual([...r.keys()], ['i1']);
  assert.match(r.get('i1')![0], /doubles the dose/);
  assert.equal(prescriptionOverlaps([items[0]], [clopilet], [clopilet.id]).size, 0, 'Clopilet is being stopped');
});

test('exact repeats with no strength written still count as the same dose', () => {
  const [o] = findOverlaps([med('Clopilet', ''), med('Clopilet', '')]);
  assert.equal(o.sameStrength, true);
  assert.match(overlapMessage(o), /doubles the dose/);
});

test('prescription review respects a pair the doctor confirmed on the medicine being updated', () => {
  const [clopilet, clopitab] = confirmPair(med('Clopilet', '75'), med('Clopitab', '75'));
  const update = [{ id: 'i1', med: med('Clopilet', '75'), targetId: clopilet.id }];
  assert.equal(prescriptionOverlaps(update, [clopilet, clopitab]).size, 0);
  const changed = [{ id: 'i1', med: med('Clopilet', '150'), targetId: clopilet.id }];
  assert.equal(prescriptionOverlaps(changed, [clopilet, clopitab]).size, 1, 'a new strength needs a fresh check');
});
