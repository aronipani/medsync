import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogueKey, checkProfile } from '../src/profile.ts';

test('brand and strength are required', () => {
  assert.equal(checkProfile({ brand: 'Clopilet', strength: '', confidence: {} }).profile, undefined);
  assert.equal(checkProfile({ brand: 'Clopilet', strength: '75 mg', confidence: { brand: 0.3 } }).profile, undefined);
  assert.equal(checkProfile('nonsense').profile, undefined);
});

test('strengths in common shapes pass, junk does not', () => {
  for (const s of ['75 mg', '2.5 mg', '500 mg + 125 mg', '1 g', '40', '10/40 mg']) assert.ok(checkProfile({ brand: 'X', strength: s }).profile, s);
  for (const s of ['seventy five', 'Exp 08/27', 'mg']) assert.equal(checkProfile({ brand: 'X', strength: s }).profile, undefined, s);
});

test('bad grid, colours and boxes are dropped', () => {
  const { profile, unsure } = checkProfile({
    brand: 'Tide', strength: '10 mg', grid: { rows: 40, cols: 2 }, colours: { foil: 'silver', print: ['#ff0000'] },
    regions: [{ cls: 'brand', box: [0.5, 0.5, 0.2, 0.9] }, { cls: 'logo', box: [0, 0, 1, 1] }],
  });
  assert.equal(profile!.grid, undefined);
  assert.ok(unsure.includes('grid'));
  assert.equal(profile!.colours, undefined);
  assert.equal(profile!.regions, undefined);
});

test('catalogue keys ignore case, spaces and a missing unit', () => {
  assert.equal(catalogueKey('Clopilet', '75 mg'), catalogueKey('CLOPILET', '75'));
  assert.notEqual(catalogueKey('Clopilet', '75 mg'), catalogueKey('Clopilet', '150 mg'));
});
