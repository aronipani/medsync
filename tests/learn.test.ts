import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addLearned, bestLearned, encode, fingerprint } from '../src/learn.ts';

// A glary Monotrate scan — the brand only partly readable.
const MONO_TAUGHT = [
  'Mononitrate Tablets IP', 'OTRATE®10', 'bide Mononitrate 10 mg', 'MONOTRATE®1O',
  'sun pharma laboratories ltd.', 'Vill: Kokjhar, Mirza Palashbari Road', 'P.O.: Palashbari, Dist: Kamrup', 'Assam-781128',
  'SCHEDULE H PRESCRIPTION', 'M.R.P.Rs.27.19', 'B.No.:GTG3975A', 'Colour: Tartrazine',
];
// Next day, a different glare pattern on the same strip.
const MONO_LATER = ['Isosorbide Mononitrate Tablets IP', 'OTRATE®10', 'Mononitrate 10 mg', 'sun pharma laboratories ltd.', 'Exp.Dt.:11/2028'];
// Same maker, same address — a different medicine.
const CLOPILET = [
  'opilet ®', 'lets IP', 'equivalent to Clopidogrel 75 mg', 'sun pharma laboratories ltd.',
  'Vill: Kokjhar, Mirza Palashbari Road', 'P.O.: Palashbari, Dist: Kamrup', 'Assam-781128', 'SCHEDULE H PRESCRIPTION', 'M.R.P. Rs. 107.40',
];

test('fingerprint keeps brand and composition, drops maker, address, warnings, price and batch', () => {
  const fp = fingerprint(MONO_TAUGHT);
  assert.ok(fp.includes('MONONITRATE'));
  assert.ok(fp.includes('OTRATE'));
  assert.ok(fp.includes('10'));
  for (const t of ['SUN', 'PHARMA', 'KOKJHAR', 'PALASHBARI', 'ASSAM', 'SCHEDULE', 'GTG3975A', '27.19', '781128', 'TARTRAZINE']) {
    assert.ok(!fp.includes(t), t);
  }
});

test('a taught strip is recognised again; a same-company strip is not', () => {
  const meds = [{ id: 'mono', learned: [encode(fingerprint(MONO_TAUGHT))] }, { id: 'clop', learned: [] as string[] }];
  assert.equal(bestLearned(MONO_LATER, meds)?.medId, 'mono');
  assert.equal(bestLearned(CLOPILET, meds), undefined);
});

test('words taught for two medicines never decide between them', () => {
  const meds = [
    { id: 'mono', learned: [encode(['MONONITRATE', 'ISOSORBIDE', 'MONOTRATE', '10'])] },
    { id: 'ismo', learned: [encode(['MONONITRATE', 'ISOSORBIDE', 'ISMO', '20'])] },
  ];
  // Only the shared generic words are readable — not enough to tell them apart.
  assert.equal(bestLearned(['Isosorbide Mononitrate Tablets'], meds), undefined);
});

test('learned list skips near-duplicates and keeps the newest 8', () => {
  let list: string[] = [];
  list = addLearned(list, ['A1X', 'MONOTRATE', '10']);
  list = addLearned(list, ['A1X', 'MONOTRATE', '10']);
  assert.equal(list.length, 1);
  for (let i = 0; i < 12; i++) list = addLearned(list, [`WORD${'X'.repeat(i)}`, 'MONOTRATE', `${i}`]);
  assert.equal(list.length, 8);
});
