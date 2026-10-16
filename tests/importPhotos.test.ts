import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessFromText, importSummary, judgeImport, parseTypedLabel, suggestBrands } from '../src/importPhotos.ts';

test('judges whether the scanner would have recognised the strip as the medicine named', () => {
  const vonzai = { name: 'Vonzai', strength: '20' };
  assert.equal(judgeImport('Vonoprazan Tablets 20 mg\nVonzai 20\nALKEM', vonzai), 'recognised');
  assert.equal(judgeImport('Vonzai\nALKEM LABORATORIES', vonzai), 'name only');
  assert.equal(judgeImport('SCHEDULE H PRESCRIPTION', vonzai), 'not recognised');
  assert.equal(judgeImport('', vonzai), 'not recognised');
});

test('typed labels: strength from its own field, or split off the end of the name', () => {
  assert.deepEqual(parseTypedLabel('Vonzai 20', ''), { name: 'Vonzai', strength: '20' });
  assert.deepEqual(parseTypedLabel('Nebicard 2.5 mg', ''), { name: 'Nebicard', strength: '2.5' });
  assert.deepEqual(parseTypedLabel('Brillo EZ 180/10', ''), { name: 'Brillo EZ', strength: '180/10' });
  assert.deepEqual(parseTypedLabel('  Sucrafil ', '1 g'), { name: 'Sucrafil', strength: '1 g' });
  assert.deepEqual(parseTypedLabel('Kerendia', '10 mg'), { name: 'Kerendia', strength: '10' });
  assert.deepEqual(parseTypedLabel('Pantodac', ''), { name: 'Pantodac', strength: '' });
  assert.equal(parseTypedLabel(' x ', ''), null);
});

test('summary counts what the scanner made of the imported photos', () => {
  assert.equal(importSummary(['recognised', 'not recognised', 'recognised']), '3 photos saved · scanner: 2 recognised, 1 not recognised');
  assert.equal(importSummary(['name only']), '1 photo saved · scanner: 0 recognised, 1 name only (strength not read)');
});

test('guesses the medicine from what was read, only when the brand is a known medicine', () => {
  const lines = [
    { text: 'Nebivolol Hydrochloride Tablets I.P.', height: 30 },
    { text: 'NEBICARD-2.5', height: 44 },
    { text: 'Each uncoated tablet contains Nebivolol 2.5 mg', height: 18 },
  ];
  const g = guessFromText(lines);
  assert.ok(g && /nebicard/i.test(g.name), JSON.stringify(g));
  assert.equal(g?.strength, '2.5');
  assert.equal(guessFromText([{ text: 'SCHEDULE H PRESCRIPTION', height: 20 }, { text: 'TORRENT PHARMA', height: 30 }]), null);
  assert.equal(guessFromText([]), null);
});

test('suggests brands as you type, starting matches first', () => {
  const s = suggestBrands('nebi');
  assert.ok(s.length >= 1 && s[0].name.toLowerCase().startsWith('nebi'), JSON.stringify(s));
  assert.ok(s.find((x) => x.name === 'Nebicard')?.strengths.includes('2.5'));
  assert.deepEqual(suggestBrands('n'), []);
});
