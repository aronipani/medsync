import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addRef, buildProfile, checkEnroll, MAX_REFS, profileWords } from '../src/stripProfile.ts';
import type { Medication } from '../src/types.ts';

const med = (id: string, name: string, strength: string, extra: Partial<Medication> = {}): Medication => ({
  id, memberId: 'ma', name, strength, aliases: [], barcodes: [], unit: 'tablet', doses: [], stock: 10, lowStockAt: 5, active: true, createdAt: '', ...extra,
});
const clopilet = med('c', 'Clopilet', '75');
const household = [clopilet, med('p', 'Pantodac', '40'), med('t', 'Tide', '10')];

test('profile words: brand and contents, not addresses, prices or batch', () => {
  const w = profileWords(['CLOPILET 75', 'Clopidogrel Tablets IP 75 mg', 'Mfd by Sun Pharma Ltd, Sikkim', 'MRP Rs 98.50 incl of all taxes', 'B.No. AB1234']);
  assert.ok(w.includes('CLOPILET') && w.includes('CLOPIDOGREL'));
  assert.ok(!w.some((x) => ['SUN', 'PHARMA', 'SIKKIM', 'MRP', 'TAXES'].includes(x)));
});

test('a new scan keeps the words an earlier one read', () => {
  const first = buildProfile(['CLOPILET 75', 'Clopidogrel'], 1, undefined, new Date('2026-10-16'));
  const again = buildProfile(['CLOPILET'], 2, { ...first, refs: ['a.jpg'] }, new Date('2026-10-20'));
  assert.ok(again.words.includes('CLOPIDOGREL'));
  assert.equal(again.sides, 2);
  assert.deepEqual(again.refs, ['a.jpg']);
});

test('reference photos: newest first, at most six, oldest dropped', () => {
  let refs: string[] = [];
  const dropped: string[] = [];
  for (let i = 1; i <= 8; i++) {
    const r = addRef(refs, `${i}.jpg`);
    refs = r.refs;
    dropped.push(...r.drop);
  }
  assert.equal(refs.length, MAX_REFS);
  assert.equal(refs[0], '8.jpg');
  assert.deepEqual(dropped, ['1.jpg', '2.jpg']);
});

test('enrolling checks the strip really is this medicine', () => {
  assert.deepEqual(checkEnroll('CLOPILET 75\nClopidogrel tablets', clopilet, household), { kind: 'ok', strengthRead: true });
  assert.deepEqual(checkEnroll('CLOPILET', clopilet, household), { kind: 'ok', strengthRead: false });
  assert.equal(checkEnroll('PANTODAC 40\nPantoprazole', clopilet, household).kind, 'other');
  assert.equal(checkEnroll('CLOPILET 150 mg', clopilet, household).kind, 'other');
  assert.equal(checkEnroll('Keep in a cool dry place', clopilet, household).kind, 'unread');
});
