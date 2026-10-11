import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchBarcode, matchText, normalizeCode, tokenize } from '../src/match.ts';

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
