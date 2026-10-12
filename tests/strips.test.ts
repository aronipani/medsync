// Text as the phone reads Aroni's real strips (photos shared 11 Oct 2026): torn foil,
// upside-down print, the generic in the biggest letters and the brand smaller.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLabel, type OcrLine } from '../src/label.ts';
import { matchDetail, matchText } from '../src/match.ts';

const L = (text: string, height = 14): OcrLine => ({ text, height });

test('Clopilet strip: brand torn off, upside-down print — reads Clopidogrel 75', () => {
  const r = parseLabel([
    L('B.No.:GT52233A M.R.P. Rs. 107.40'),
    L('Mfg. Dt.: 07/2026 (Incl. of all taxes)'),
    L('Exp. Dt.: 06/2028 per 15 Tablets'),
    L('® Registered Trade Mark'),
    L('Manufactured in India by:'),
    L('sun pharma laboratories ltd.'),
    L('SCHEDULE H PRESCRIPTION DRUG - CAUTION'),
    L('opilet ®', 30),
    L('lets IP', 26),
    L('Each film coated tablet contains:'),
    L('Clopidogrel Bisulphate IP'),
    L('equivalent to Clopidogrel   75 mg'),
    L('Iron Oxide (Red) USP-NF'),
    L('Titanium Dioxide IP'),
    L('Dosage: As directed by the Physician.'),
    L('Store at room temperature, protected from light & moisture.'),
  ]);
  assert.deepEqual(r.ingredients, [{ name: 'Clopidogrel', strength: '75' }]);
  assert.equal(r.name, 'Clopidogrel');
  assert.equal(r.strength, '75');
  assert.equal(r.contents, 'Clopidogrel 75 mg');
});

test('Brillo EZ strip: two-medicine combination', () => {
  const r = parseLabel([
    L('Dosage: As directed by the Medical Specialist.'),
    L('Store at a temperature not exceeding 30°C,'),
    L('Bempedoic Acid and Ezetimibe Tablets', 40),
    L('Brillo EZ', 34),
    L('Composition:'),
    L('Each film coated tablet contains:'),
    L('Bempedoic Acid      180 mg'),
    L('Ezetimibe IP        10 mg'),
    L('Excipients q.s.'),
    L('Colours: Brilliant Blue Lake and Titanium Dioxide IP'),
    L('Manufactured in India by:'),
    L('Akums Drugs & Pharmaceuticals Ltd.'),
    L('Marketed by:'),
    L('Sun Pharma laboratories ltd.'),
  ]);
  assert.deepEqual(r.ingredients, [
    { name: 'Bempedoic Acid', strength: '180' },
    { name: 'Ezetimibe', strength: '10' },
  ]);
  assert.equal(r.name, 'Brillo EZ');
  assert.equal(r.strength, '180/10');
  assert.equal(r.contents, 'Bempedoic Acid 180 mg + Ezetimibe 10 mg');
  assert.deepEqual(r.aliases, ['Bempedoic Acid 180 + Ezetimibe 10']);
});

test('Nebicard strip: generic split over two lines, decimal strength, company name ignored', () => {
  const r = parseLabel([
    L('East District, Gangtok, Sikkim-737 135.'),
    L('Rx'),
    L('Nebivolol', 40),
    L('Hydrochloride Tablets I.P.', 40),
    L('NEBICARD-2.5', 30),
    L('Each uncoated tablet contains :'),
    L('Nebivolol Hydrochloride I.P.'),
    L('equivalent to Nebivolol      2.5 mg'),
    L('Dose : As directed by the Physician'),
    L('STORE BELOW 30°C, PROTECTED'),
    L('FROM LIGHT AND MOISTURE.'),
    L('Keep out of reach of children'),
    L('TORRENT', 30),
    L('PHARMA'),
    L('M.R.P. PER BLISTER PACK'),
    L('OF 15 TABS. ₹182.00'),
    L('EXP.JAN.2028'),
  ]);
  assert.deepEqual(r.ingredients, [{ name: 'Nebivolol', strength: '2.5' }]);
  assert.equal(r.name, 'Nebicard');
  assert.equal(r.strength, '2.5');
  assert.deepEqual(r.aliases, ['Nebivolol 2.5']);
});

test('Cilacar T strip: combination, weekday printing ignored', () => {
  const r = parseLabel([
    L('MON → TUE → WED → THU', 30),
    L('Rx'),
    L('15 Tablets'),
    L('Cilnidipine & Telmisartan Tablets', 40),
    L('CILACAR® T', 36),
    L('Dosage:'),
    L('As directed by the Physician.'),
    L('Composition:'),
    L('Each film coated tablet contains:'),
    L('Cilnidipine ............ 10 mg'),
    L('Telmisartan IP .......... 40 mg'),
    L('Excipients .............. q.s.'),
    L('Colour: Titanium Dioxide'),
    L('Storage:'),
    L('MON ← SUN ← SAT ← FRI', 30),
  ]);
  assert.deepEqual(r.ingredients.map((i) => i.name), ['Cilnidipine', 'Telmisartan']);
  assert.equal(r.name, 'Cilacar T');
  assert.equal(r.strength, '10/40');
});

test('a torn strip still verifies by the medicine name when the brand is missing', () => {
  const med = { name: 'Clopilet', strength: '75', aliases: ['Clopidogrel 75'] };
  assert.equal(matchText('opilet ® equivalent to Clopidogrel 75 mg Iron Oxide', med).matched, true);
  const combo = { name: 'Brillo EZ', strength: '180/10', aliases: ['Bempedoic Acid 180 + Ezetimibe 10'] };
  assert.equal(matchText('Bempedoic Acid 180 mg Ezetimibe IP 10 mg', combo).matched, true);
  assert.equal(matchText('Ezetimibe IP 10 mg', combo).matched, false); // half a combination isn't a match
});

test('Monotrate strip: torn "OTRATE", partial generic words, ® read as 8', () => {
  const r = parseLabel([
    L('Mononitrate Tablets IP', 30), L('contains:'), L('Mononitrate IP'), L('bide Mononitrate   10 mg'),
    L('OTRATE®10', 16), L('MONOTRATE®10', 16), L('MONOTRATE®10', 16),
    L('SCHEDULE H PRESCRIPTION'), L('DRUG - CAUTION: Not to be sold'), L('sun pharma laboratories ltd.'),
    L('Isosorbide Mononitrate Tablets IP', 30), L('MONOTRATE ®10', 22), L('Each uncoated tablet contains:'),
    L('Diluted Isosorbide Mononitrate IP'), L('equivalent to'), L('Isosorbide Mononitrate     10 mg'),
    L('Colour: Tartrazine'), L('M.R.P.Rs.27.19'), L('per 10 Tablets'),
  ]);
  assert.equal(r.name, 'Monotrate');
  assert.equal(r.strength, '10');
  assert.deepEqual(r.ingredients, [{ name: 'Isosorbide Mononitrate', strength: '10' }]);
  assert.ok(!r.nameOptions.includes('Otrate'));
  assert.ok(!r.nameOptions.includes('Drug'));
  assert.ok(!r.nameOptions.includes('Mononitrate'));
  assert.ok(r.nameOptions.includes('Ismo')); // other brand of the same medicine, from the built-in list

  for (const med of [
    { name: 'Ismo', strength: '10', aliases: ['Monotrate 10'] },
    { name: 'Ismo / Monotrate', strength: '10', aliases: [] },
    { name: 'Ismo', strength: '10', aliases: [] }, // matched through the built-in list
  ]) {
    assert.ok(['match', 'substitute'].includes(matchDetail('MONOTRATE810 Isosorbide Mononitrate 10 mg', med).level), med.name);
  }
  assert.equal(matchText('MONOTRATE810', { name: 'Monotrate', strength: '10', aliases: [] }).matched, true);
});
