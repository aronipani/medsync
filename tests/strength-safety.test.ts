// Review 24 Oct 2026: a number printed anywhere on a strip (temperature, address, pack count) must never count as
// the strength when a different strength is printed. Wrong strength → "otherStrength" (don't take), never "match".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchDetail, matchText } from '../src/match.ts';

const med = (name: string, strength: string, aliases: string[] = []) => ({ name, strength, aliases });

test('a temperature is not the strength', () => {
  const thyronorm25 = med('Thyronorm', '25');
  const strip = 'THYRONORM 50\nThyroxine Sodium Tablets IP 50 mcg\nStore below 25°C';
  assert.equal(matchText(strip, thyronorm25).matched, false);
  assert.equal(matchDetail(strip, thyronorm25).level, 'otherStrength');
});

test('an address or licence number is not the strength', () => {
  const telma40 = med('Telma', '40');
  for (const strip of [
    'TELMA 80\nTelmisartan Tablets IP 80 mg\nMfd by Glenmark, Plot No. 40, Goa',
    'TELMA\nTelmisartan Tablets IP\n80 mg\n10 x 15 tablets\nPlot No. 40 Sector',
  ]) {
    assert.notEqual(matchDetail(strip, telma40).level, 'match', strip);
  }
});

test('a pack count is not the strength', () => {
  const amlong5 = med('Amlong', '5');
  const strip = 'AMLONG 10\nAmlodipine Tablets IP 10 mg\n5 strips of 15 tablets\nStore below 25 °C';
  assert.notEqual(matchDetail(strip, amlong5).level, 'match');
});

test('the right strength still matches, with other numbers around it', () => {
  assert.equal(matchDetail('THYRONORM 25\nThyroxine Sodium Tablets IP 25 mcg\nStore below 30°C', med('Thyronorm', '25')).level, 'match');
  assert.equal(matchDetail('TELMA 40\nTelmisartan Tablets IP 40 mg\nPlot No. 12, Goa', med('Telma', '40')).level, 'match');
});

test('a combination strength printed as its parts still matches (Augmentin 625 = 500 + 125)', () => {
  const augmentin = med('Augmentin', '625');
  const strip = 'AUGMENTIN 625 DUO\nAmoxycillin 500 mg\nPotassium Clavulanate 125 mg';
  assert.equal(matchDetail(strip, augmentin).level, 'match');
  const partsOnly = 'AUGMENTIN\nAmoxycillin 500 mg\nPotassium Clavulanate 125 mg';
  assert.notEqual(matchDetail(partsOnly, augmentin).level, 'otherStrength');
});

test('household fragment matcher: a temperature or address is not the strength', async () => {
  const { strengthSeen } = await import('../src/household.ts');
  assert.equal(strengthSeen('THYRONORM\nThyroxine Sodium 50 mcg\nStore below 25°C', '25'), 'other');
  assert.equal(strengthSeen('…LMA\nTelmisartan 80 mg\nPlot No. 40', '40'), 'other');
  assert.equal(strengthSeen('…LOPIL… 75\nClopidogrel 75 mg', '75'), 'same');
  assert.equal(strengthSeen('…LOPIL…\nStore below 30°C', '75'), 'unknown');
});

test('QR text is not a linked code, and its checks catch a look-alike (Telma H for Telma)', async () => {
  const { codeLinked } = await import('../src/match.ts');
  const telma40 = { ...med('Telma', '40'), barcodes: ['8901234567890'] };
  assert.equal(codeLinked('TELMA-H 40MG TAB', telma40), false);
  assert.equal(codeLinked('8901234567890', telma40), true);
  assert.notEqual(matchDetail('TELMA-H 40MG TAB', telma40, [telma40]).level, 'match');
});

test('a taught strip read without its strength is not "same" (scan shows amber, not green)', async () => {
  const { strengthSeen } = await import('../src/household.ts');
  assert.equal(strengthSeen('TELMA\nTelmisartan Tablets IP\nGlenmark', '40'), 'unknown');
  assert.equal(strengthSeen('TELMA 40\nTelmisartan Tablets IP 40 mg', '40'), 'same');
  assert.equal(strengthSeen('TELMA 80\nTelmisartan Tablets IP 80 mg', '40'), 'other');
});

test('no voice line calls a strip the wrong (or correct) medicine in any language', async () => {
  const { LANGS } = await import('../src/phrases.ts');
  const banned = /wrong medicine|wrong strength|correct medicine|गलत दवा|सही दवा|ভুল ওষুধ|সঠিক ওষুধ|ਗਲਤ ਦਵਾਈ|ਸਹੀ ਦਵਾਈ|తప్పు మందు|ખોટી દવા|தவறான மருந்து|ತಪ್ಪು ಔಷಧಿ|ভুল ঔষধ|药品不对|equivocado|Maling gamot|違うお薬/i;
  for (const [code, lang] of Object.entries(LANGS)) for (const [k, v] of Object.entries(lang.phrases)) assert.doesNotMatch(String(v), banned, `${code}.${k}`);
});
