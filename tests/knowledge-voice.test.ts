import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookupBrand, relatedNames } from '../src/drugdb.ts';
import { matchDetail } from '../src/match.ts';
import { amountText, LANG_ORDER, LANGS, matchAnnouncement, phrase, spokenStrength } from '../src/phrases.ts';
import { parseLabel } from '../src/label.ts';

test('built-in list: brands, combos and the longest brand wins', () => {
  assert.deepEqual(lookupBrand('NEBICARD-2.5')?.ingredients, ['Nebivolol']);
  assert.deepEqual(lookupBrand('Cilacar T')?.ingredients, ['Cilnidipine', 'Telmisartan']);
  assert.deepEqual(lookupBrand('Cilacar')?.ingredients, ['Cilnidipine']);
  assert.deepEqual(lookupBrand('Telma H')?.ingredients, ['Telmisartan', 'Hydrochlorothiazide']);
  assert.equal(lookupBrand('Unknownium'), undefined);
  const r = relatedNames({ name: 'Clopilet', strength: '75' });
  assert.equal(r.generic, 'Clopidogrel 75');
  assert.ok(r.otherBrands.includes('Plavix 75'));
  assert.equal(relatedNames({ name: 'Cilacar T', strength: '10/40' }).generic, 'Cilnidipine 10 + Telmisartan 40');
});

test('dose check levels: match, generic, substitute, name only, other strength, none', () => {
  const clopilet = { name: 'Clopilet', strength: '75', aliases: [] as string[] };
  assert.equal(matchDetail('CLOPILET 75 Clopidogrel tablets', clopilet).level, 'match');
  // torn brand — contents from the built-in list still verify it
  assert.equal(matchDetail('opilet equivalent to Clopidogrel 75 mg', clopilet).level, 'match');
  // another brand of the same medicine and strength
  const d = matchDetail('PLAVIX 75 mg tablets', clopilet);
  assert.equal(d.level, 'substitute');
  assert.equal(d.via, 'Plavix 75');
  // name readable, strength torn off
  assert.equal(matchDetail('Nebicard Torrent Pharma', { name: 'Nebicard', strength: '2.5', aliases: [] }).level, 'nameOnly');
  // different strength printed
  const other = matchDetail('NEBICARD-5 Nebivolol 5 mg', { name: 'Nebicard', strength: '2.5', aliases: [] });
  assert.equal(other.level, 'otherStrength');
  assert.deepEqual(other.foundStrengths, ['5']);
  assert.equal(matchDetail('Dolo 650 Paracetamol 650 mg', { name: 'Dolo', strength: '500', aliases: [] }).level, 'otherStrength');
  // unrelated medicine
  assert.equal(matchDetail('Telma 40 Telmisartan', clopilet).level, 'none');
});

test('torn strip with only the contents offers the known brands as names', () => {
  const r = parseLabel([{ text: 'equivalent to Clopidogrel 75 mg', height: 14 }, { text: 'opilet ®', height: 30 }]);
  assert.equal(r.name, 'Clopidogrel');
  assert.ok(r.nameOptions.includes('Clopilet'));
  assert.ok(r.nameOptions.includes('Plavix'));
});

test('a readable brand fills in the contents from the built-in list', () => {
  const r = parseLabel([{ text: 'NEBICARD-2.5', height: 40 }, { text: 'Torrent Pharma', height: 20 }]);
  assert.equal(r.name, 'Nebicard');
  assert.equal(r.contents, 'Nebivolol 2.5 mg');
});

test('every language has every phrase and amount', () => {
  for (const code of LANG_ORDER) {
    for (const key of Object.keys(LANGS.en.phrases) as (keyof typeof LANGS.en.phrases)[]) {
      assert.ok(LANGS[code].phrases[key], `${code}.${key}`);
    }
    for (const q of [0.25, 0.5, 1, 1.5, 2]) assert.ok(amountText(code, q, 'tablet').length > 0, `${code} ${q}`);
    assert.match(phrase(code, 'correct', { name: 'Clopilet 75' }), /Clopilet 75/);
    assert.match(phrase(code, 'checkStrength', { strength: '2.5 mg' }), /2\.5 mg/);
  }
});

test('amounts read naturally', () => {
  assert.equal(amountText('en', 0.5, 'tablet'), 'half a tablet');
  assert.equal(amountText('en', 2, 'tablet'), '2 tablets');
  assert.equal(amountText('en', 10, 'ml'), '10 millilitres');
  assert.equal(amountText('hi', 0.5, 'tablet'), 'आधी गोली');
  assert.equal(amountText('hi', 1.5, 'tablet'), 'डेढ़ गोली');
  assert.equal(amountText('bn', 0.5, 'tablet'), 'আধখানা ট্যাবলেট');
  assert.equal(amountText('es', 0.5, 'tablet'), 'media pastilla');
  assert.equal(amountText('es', 1, 'sachet'), 'un sobre');
  assert.equal(amountText('zh', 0.5, 'tablet'), '半片');
  assert.equal(amountText('ja', 0.5, 'tablet'), '半錠');
  assert.equal(spokenStrength('2.5'), '2.5 mg');
  assert.equal(spokenStrength('10/40'), '10 / 40 mg');
  assert.equal(spokenStrength('50 mcg'), '50 mcg');
  assert.equal(
    matchAnnouncement('hi', [{ name: 'Clopilet 75', qty: 0.5, unit: 'tablet' }]),
    'सही दवा: Clopilet 75। अभी आधी गोली लीजिए।',
  );
});
