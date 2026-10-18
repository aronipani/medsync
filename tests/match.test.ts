import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchBarcode, matchDetail, matchText, normalizeCode, tokenize } from '../src/match.ts';

const dolo = { name: 'Dolo', strength: '650', aliases: ['Paracetamol 650'], barcodes: [] as string[] };
const telma = { name: 'Telma', strength: '40', aliases: ['Telmisartan 40'], barcodes: [] as string[] };
const thyronorm = { name: 'Thyronorm', strength: '50 mcg', aliases: [], barcodes: [] as string[] };
const glycomet = { name: 'Glycomet GP', strength: '2', aliases: ['Metformin 500 Glimepiride 2'], barcodes: [] as string[] };

test('tokenize splits letter/digit runs and keeps decimals', () => {
  assert.deepEqual(tokenize('DOLO-650mg'), ['DOLO', '650', 'MG']);
  assert.deepEqual(tokenize('Glycomet-GP 2.5'), ['GLYCOMET', 'GP', '2.5']);
});

test('matches typical strip text', () => {
  assert.equal(matchText('Paracetamol Tablets IP 650 mg  DOLO-650  Micro Labs Ltd', dolo).matched, true);
  assert.equal(matchText('Telmisartan Tablets IP 40mg TELMA 40 Glenmark', telma).matched, true);
  assert.equal(matchText('Thyroxine Sodium Tablets IP THYRONORM 50 mcg', thyronorm).matched, true);
});

test('tolerates OCR errors', () => {
  assert.equal(matchText('D0LO 65O', dolo).matched, true); // 0/O swaps
  assert.equal(matchText('DO LO-650', dolo).matched, true); // split word
  assert.equal(matchText('THYR0NORM 5O mcg', thyronorm).matched, true);
});

test('rejects wrong strength but reports the name', () => {
  const r = matchText('DOLO 500 Paracetamol tablets IP 500 mg', dolo);
  assert.equal(r.matched, false);
  assert.equal(r.nameFound, true);
  assert.equal(matchText('Telma 80 Telmisartan 80mg', telma).matched, false);
});

test('rejects other medicines', () => {
  assert.equal(matchText('Pan 40 Pantoprazole gastro-resistant tablets', telma).matched, false);
  assert.equal(matchText('Crocin 650 Advance', dolo).matched, false);
  assert.equal(matchText('Telma 40', dolo).matched, false);
});

test('multi-word names and combination strengths', () => {
  assert.equal(matchText('GLYCOMET-GP 2 Metformin Hydrochloride 500 mg Glimepiride 2 mg', glycomet).matched, true);
  assert.equal(matchText('GLYCOMET-GP 1', glycomet).matched, false);
});

test('barcodes: GTIN normalisation and QR text', () => {
  assert.equal(normalizeCode('(01)08901234567890(17)270101'), 'GTIN:08901234567890');
  assert.equal(normalizeCode('8901234567890'), 'GTIN:08901234567890');
  const med = { ...dolo, barcodes: ['8901234567890'] };
  assert.equal(matchBarcode('0108901234567890172701011012345', med), true);
  assert.equal(matchBarcode('8901234567891', med), false);
  assert.equal(matchBarcode('Product: DOLO 650 Batch DOBS1234', dolo), true);
});

// Oct 2026: Aroni's Pan 20, scanned with a Pantodac 40 strip and a Pentowok-D strip (pantoprazole + domperidone).
const pan20 = { name: 'Pan', strength: '20', aliases: [] as string[] };

test('a bare strength after a brand of the same family is read: Pantodac 40 is not Pan 20', async () => {
  const { printedStrengths } = await import('../src/match.ts');
  const d = matchDetail('Rx\nPantoprazole Gastro-resistant Tab\nPantodac 40\nEach Gastro-resistant tablet', pan20);
  assert.equal(d.level, 'otherStrength');
  assert.deepEqual(d.foundStrengths, ['40']);
  // Addresses, pack counts and licence numbers are not strengths.
  assert.deepEqual(printedStrengths('Bandra-Kurla Complex\nMumbai 400 051\nPer 10 Tablets\nLic No 924', pan20, 'Pantoprazole'), []);
});

test('pantoprazole + domperidone is a different medicine from Pan', () => {
  const d = matchDetail('Pantoprazole &\nDomperidone Tablets', pan20);
  assert.equal(d.level, 'conflict');
  assert.match(d.looksLike ?? '', /Domperidone/);
});

test('a read with no medicine name in it is a reading problem, not a wrong medicine', async () => {
  const { readsAsMedicine } = await import('../src/match.ts');
  assert.equal(readsAsMedicine('PENTOWOK D PENTOWOK D\nWOCKHARDT', [pan20]), false); // brand the app doesn't know
  assert.equal(readsAsMedicine('Mfg. Lic. No. MNB/20/1116\nMumbai - 400 051', [pan20]), false);
  assert.equal(readsAsMedicine('Pantoprazole Gastro-resistant', [pan20]), true); // contents read
  assert.equal(readsAsMedicine('DOLO 650', []), true); // a known brand
});
