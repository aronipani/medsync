import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanBrand, compile, parseComposition, parseCsv } from '../src/medlist.ts';

test('brand names lose strengths, pack sizes and form words', () => {
  assert.equal(cleanBrand('Telma-H 40 Tablet'), 'Telma-H');
  assert.equal(cleanBrand('Dolo 650 Tablet'), 'Dolo');
  assert.equal(cleanBrand('Ecosprin-AV 75 Capsule'), 'Ecosprin-AV');
  assert.equal(cleanBrand('Crocin Advance Tablet'), 'Crocin Advance');
  assert.equal(cleanBrand('Glycomet-GP 1 Forte Tablet PR'), 'Glycomet-GP');
  assert.equal(cleanBrand('Azee 100mg/5ml Syrup'), 'Azee');
});

test('composition becomes ingredients in label order and a combined strength', () => {
  assert.deepEqual(parseComposition('Telmisartan (40mg) + Hydrochlorothiazide (12.5mg)'), { ingredients: ['Telmisartan', 'Hydrochlorothiazide'], strength: '40/12.5' });
  assert.deepEqual(parseComposition('Clopidogrel (75mg)'), { ingredients: ['Clopidogrel'], strength: '75' });
  assert.deepEqual(parseComposition('AMLODIPINE 5MG'), { ingredients: ['Amlodipine'], strength: '' });
  assert.equal(parseComposition(''), undefined);
  assert.equal(parseComposition('(10mg)'), undefined);
});

test('compile groups brands by contents and skips risky names', () => {
  const rows = [
    { name: 'Clopivas 75 Tablet', composition: 'Clopidogrel (75mg)' },
    { name: 'Clopivas 150 Tablet', composition: 'Clopidogrel (150mg)' },
    { name: 'Ceruvin 75 Tablet', composition: 'Clopidogrel (75mg)' },
    { name: 'Clopilet 75 Tablet', composition: 'Clopidogrel (75mg)' }, // hand-checked
    { name: 'Relief Tablet', composition: 'Paracetamol (500mg)' }, // common word
    { name: 'Abc 5 Tablet', composition: 'Amlodipine (5mg)' }, // too short
    { name: 'Mixup 10 Tablet', composition: 'Amlodipine (10mg)' },
    { name: 'Mixup 20 Tablet', composition: 'Atorvastatin (20mg)' }, // same brand, other contents → ambiguous
    { name: 'Nocomp Tablet', composition: '' },
    { name: 'Gone 5 Tablet', composition: 'Amlodipine (5mg)', skip: true },
  ];
  const { list, stats } = compile(rows, new Set(['clopilet']), 'test', '2026-10-15');
  assert.deepEqual(list.entries, [[['Clopidogrel'], ['75', '150'], ['Ceruvin', 'Clopivas']]]);
  assert.deepEqual(stats.skipped, { noContents: 1, shortName: 1, commonWord: 1, ambiguous: 1, handChecked: 1, filtered: 1 });
  assert.equal(stats.brands, 2);
});

test('CSV reader handles quotes, commas and newlines inside fields', () => {
  const rows = parseCsv('name,short_composition1\n"Telma-H 40 Tablet","Telmisartan (40mg), IP"\r\nDolo 650 Tablet,"Paracetamol\n(650mg)"\n');
  assert.deepEqual(rows, [
    { name: 'Telma-H 40 Tablet', short_composition1: 'Telmisartan (40mg), IP' },
    { name: 'Dolo 650 Tablet', short_composition1: 'Paracetamol\n(650mg)' },
  ]);
});
