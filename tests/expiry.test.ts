import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expiryStatus, formatExpiry, parseExpiry } from '../src/expiry.ts';

const NOW = new Date(2026, 9, 15);

test('reads the expiry formats printed on real strips', () => {
  assert.equal(parseExpiry('B.No.GRG5N002 MFG.04-26 EXP.03-28\nM.R.P.₹ 78.60 PER 10 TABS.I.A.T.', NOW), '2028-03'); // Tide-10
  assert.equal(parseExpiry('Mfg.Dt.:07/2026 (Incl.of all taxes)\nExp.Dt.:06/2028 per 15 Tablets', NOW), '2028-06'); // Clopilet
  assert.equal(parseExpiry('MFD. 05/2026 EXPIRY DATE 04/2028', NOW), '2028-04'); // Brillo EZ
  assert.equal(parseExpiry('BATCH No.JC01225 MFG.04/26 EXPIRY 09/2027 M.R.P.Rs.107.20', NOW), '2027-09'); // Clopitab
  assert.equal(parseExpiry('Exp: MAR 2028', NOW), '2028-03');
  assert.equal(parseExpiry('USE BEFORE 3.2029', NOW), '2029-03');
  assert.equal(parseExpiry('exp 11-27', NOW), '2027-11');
});

test('ignores manufacturing dates, misreads and text without an expiry', () => {
  assert.equal(parseExpiry('MFG.04-26 M.R.P.₹ 78.60', NOW), undefined);
  assert.equal(parseExpiry('EXP 13/28', NOW), undefined);
  assert.equal(parseExpiry('EXP 03/2090', NOW), undefined);
  assert.equal(parseExpiry('Each tablet contains Torsemide 10 mg', NOW), undefined);
});

test('two strips in one photo: the earliest expiry wins', () => {
  assert.equal(parseExpiry('EXP.03-28\nEXP.09-27', NOW), '2027-09');
});

test('a printed month lasts to its end; soon within 30 days', () => {
  assert.equal(expiryStatus('2026-10', new Date(2026, 9, 31, 23)), 'soon');
  assert.equal(expiryStatus('2026-10', new Date(2026, 10, 1)), 'expired');
  assert.equal(expiryStatus('2026-11', NOW), 'ok');
  assert.equal(expiryStatus('2026-11', new Date(2026, 10, 5)), 'soon');
  assert.equal(formatExpiry('2028-03'), 'Mar 2028');
});
