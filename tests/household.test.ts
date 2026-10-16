import { test } from 'node:test';
import assert from 'node:assert/strict';
import { covered, householdMatch, lookAlike, nameCover, strengthSeen } from '../src/household.ts';

const med = (id: string, name: string, strength: string, aliases: string[] = []) => ({ id, name, strength, aliases });
const clopilet = med('clopilet', 'Clopilet', '75', ['Clopidogrel 75']);
const household = [
  clopilet,
  med('pantodac', 'Pantodac', '40', ['Pantoprazole 40']),
  med('cordarone', 'Cordarone X', '200', ['Amiodarone 200']),
  med('tide', 'Tide', '10', ['Torsemide 10']),
  med('kerendia', 'Kerendia', '10', ['Finerenone 10']),
  med('monotrate', 'Monotrate', '10', ['Isosorbide Mononitrate 10']),
  med('nebicard', 'Nebicard', '2.5', ['Nebivolol 2.5']),
  med('sucrafil', 'Sucrafil', '1 g', ['Sucralfate 1000']),
  med('vonzai', 'Vonzai', '20', ['Vonoprazan 20']),
  med('augmentin', 'Augmentin', '625', ['Amoxycillin 500 Clavulanic Acid 125']),
];
const verdict = (text: string, meds = household) => householdMatch(text, meds);

test('a fragment covers the matching letters of a name', () => {
  assert.equal(covered('LOPIL', 'CLOPILET').length, 5);
  assert.equal(covered('XYZW', 'CLOPILET').length, 0);
  assert.equal(nameCover(['CLOPI', 'ILET'], 'CLOPILET'), 1); // two half names from different pockets
});

test('half names from a cut strip still pick the right medicine', () => {
  const v = verdict('…LOPIL… 75 mg\nidogrel Tabl');
  assert.equal(v.kind === 'sure' || v.kind === 'likely' ? v.medId : v.kind, 'clopilet');
  const w = verdict('ANTODA 40\nprazole gastro');
  assert.equal(w.kind === 'sure' || w.kind === 'likely' ? w.medId : w.kind, 'pantodac');
});

test('fragment plus strength, nothing similar in the house: sure', () => {
  assert.equal(verdict('LOPILE 75').kind, 'sure');
});

test('fragment without a readable strength is only likely (amber)', () => {
  assert.equal(verdict('CLOPIL').kind, 'likely');
});

test('random text and common strip print pick nothing', () => {
  assert.equal(verdict('Store below 30C protect from light and moisture TABLETS IP').kind, 'none');
  assert.equal(verdict('BATCH 2403 MFG 03/2026').kind, 'none');
});

test('a different strength printed rules the medicine out', () => {
  assert.equal(verdict('CLOPILET 150 mg').kind, 'none');
});

test('look-alikes in the house: never sure, even with name and strength', () => {
  const withTwin = [...household, med('clopitab', 'Clopitab', '75', ['Clopidogrel 75'])];
  assert.ok(lookAlike(clopilet, withTwin.at(-1)!));
  const v = verdict('CLOPILET 75', withTwin);
  assert.notEqual(v.kind, 'sure');
});

test('two medicines fit equally: unsure', () => {
  const a = med('a', 'Rosuvas', '10');
  const b = med('b', 'Rosuday', '10');
  assert.equal(verdict('ROSU 10', [a, b]).kind, 'unsure');
  // The full name tips it to one of them — but they are look-alikes, so only amber.
  const v = verdict('ROSUVAS 10', [a, b]);
  assert.deepEqual([v.kind, v.kind === 'likely' ? v.medId : ''], ['likely', 'a']);
});

test('a strip belonging to another family member is still identified (the caller says whose it is)', () => {
  const papa = { ...med('papa-clop', 'Clopilet', '75'), memberId: 'papa' };
  const v = verdict('CLOPILE 75', [papa, med('mine', 'Pantodac', '40')]);
  assert.equal(v.kind === 'sure' || v.kind === 'likely' ? v.medId : v.kind, 'papa-clop');
});

test('taught-strip words count as name words', () => {
  const m = { ...med('x', 'Brillo EZ', '10'), learned: ['BRILLO EZETIMIBE ROSUVASTATIN 10'] };
  const v = verdict('ZETIMIB 10', [m, med('y', 'Tide', '10')]);
  assert.equal(v.kind === 'sure' || v.kind === 'likely' ? v.medId : v.kind, 'x');
});

test('strength seen', () => {
  assert.equal(strengthSeen('CLOPILET 75', '75'), 'same');
  assert.equal(strengthSeen('CLOPILET 150 mg', '75'), 'other');
  assert.equal(strengthSeen('CLOPILET MRP Rs 75', '75'), 'unknown'); // a price is not a strength
});

test('contents name from the built-in list: a strip with only "CLOPIDOGREL 75" left', () => {
  const only = [med('clopilet', 'Clopilet', '75'), med('pantodac', 'Pantodac', '40')]; // no aliases typed
  const v = verdict('…OPIDOGREL Tablets IP 75 mg', only);
  assert.equal(v.kind === 'sure' || v.kind === 'likely' ? v.medId : v.kind, 'clopilet');
});

test('hints (word-list reading) lift to amber at most', () => {
  // The raw reading has almost nothing; the word-list reading says CLOPILET 75.
  const v = householdMatch('C… 7', household, ['CLOPILET 75']);
  assert.deepEqual([v.kind, v.kind === 'likely' ? v.medId : ''], ['likely', 'clopilet']);
  // Raw reading alone already sure: hints don't change it.
  assert.equal(householdMatch('LOPILE 75', household, ['PANTODAC 40']).kind, 'sure');
});

test('a hint pointing to a different medicine than the raw reading makes it unsure', () => {
  const v = householdMatch('CLOPIL', household, ['PANTODAC 40']);
  assert.equal(v.kind, 'unsure');
});
