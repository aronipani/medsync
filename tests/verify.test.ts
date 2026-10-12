// "Is this strip really the medicine that's due?" — the cases that a name-only search gets wrong.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findConflict, matchDetail, matchText, strengthText } from '../src/match.ts';

const med = (name: string, strength: string, aliases: string[] = []) => ({ name, strength, aliases });
const household = [med('Clopilet', '75', ['Plavix 75']), med('Monotrate', '10', ['Ismo 10']), med('Tide', '20'), med('Cordarone', '200')];

test('pack count, price, batch and dates are never taken as the strength', () => {
  assert.equal(matchText('MONOTRATE 20 mg\nper 10 Tablets', med('Monotrate', '10')).matched, false);
  assert.equal(matchText('CLOPILET\nM.R.P. Rs. 75.00', med('Clopilet', '75')).matched, false);
  assert.equal(matchText('TIDE\nB.No. 20A55 Exp. 10/2028', med('Tide', '20')).matched, false);
  assert.equal(matchText('DOLO 650\n15 Tablets', med('Dolo', '650')).matched, true);
  assert.equal(strengthText('per 10 Tablets\nMRP Rs. 75.00\nMONOTRATE 10').trim(), 'MONOTRATE 10');
});

test('look-alike words: the medicine name on a strip is not a misread brand', () => {
  assert.equal(matchText('MONONITRATE 10', med('Monotrate', '10')).nameFound, false);
  assert.equal(matchText('MONOTRATE 10', med('Monotrate', '10')).matched, true);
  assert.equal(matchText('M0N0TRATE 10', med('Monotrate', '10')).matched, true); // O read as 0 still fine
});

test('a combination strip is not the single medicine', () => {
  const telmaH = 'TELMA-H\nTelmisartan 40 mg\nHydrochlorothiazide 12.5 mg';
  assert.equal(matchDetail(telmaH, med('Telma', '40'), household).level, 'conflict');
  assert.equal(matchDetail(telmaH, med('Telma', '40'), household).looksLike, 'Telma H');
  const cilacarT = 'CILACAR® T\nCilnidipine 10 mg\nTelmisartan IP 40 mg';
  const d = matchDetail(cilacarT, med('Cilacar', '10'), household);
  assert.equal(d.level, 'conflict');
  assert.equal(d.looksLike, 'Cilacar T');
});

test('another medicine printed clearly beats a near-match of the expected name', () => {
  // Expected "Tide 20" — the strip clearly says Clopilet; "TIDE" isn't printed, but "75"/"20" noise is.
  assert.equal(matchDetail('CLOPILET 75\nClopidogrel 75 mg\nper 20 tablets', med('Tide', '20'), household).level, 'none');
  assert.equal(findConflict('CLOPILET 75 Clopidogrel 75 mg', med('Monotrate', '10', ['Isosorbide Mononitrate 10']), household), 'Clopilet');
});

test('the real Monotrate strip still matches, even with a same-company medicine in the household', () => {
  const strip = ['Isosorbide Mononitrate Tablets IP', 'MONOTRATE®10', 'Each uncoated tablet contains:', 'Isosorbide Mononitrate 10 mg',
    'sun pharma laboratories ltd.', 'M.R.P.Rs.27.19', 'per 10 Tablets'].join('\n');
  assert.equal(matchDetail(strip, med('Monotrate', '10', ['Ismo 10']), household).level, 'match');
  assert.equal(matchDetail(strip, med('Ismo', '10'), household).level, 'match'); // via contents / other brand of the same medicine
  assert.equal(matchDetail(strip, med('Clopilet', '75'), household).level, 'none');
});

test('a substitute brand of the same medicine is not a conflict', () => {
  assert.equal(matchDetail('PLAVIX 75 mg Clopidogrel', med('Clopilet', '75'), household).level, 'match'); // listed as alias
  assert.equal(matchDetail('DEPLATT 75 Clopidogrel 75 mg', med('Clopilet', '75'), household).level, 'match');
});
