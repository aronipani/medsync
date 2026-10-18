import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseScan } from '../src/scanIssue.ts';

const household = [
  { name: 'Pan', strength: '20', aliases: [] as string[] },
  { name: 'Clopilet', strength: '75', aliases: [] as string[] },
];

test('a weak read names the scan problem, not the medicine', () => {
  assert.equal(diagnoseScan('', household).issue, 'nothing');
  assert.equal(diagnoseScan('PAN 4', household).issue, 'tooLittle');
  assert.equal(diagnoseScan('Pa nt o pr az ol e Ga st ro', household).issue, 'broken');
  // The back of the Pentowok-D strip: address and licence print only.
  assert.equal(diagnoseScan('Marketed by:\nWOCKHARDT LIMITED\nBandra-Kurla Complex,\nMumbai - 400 051\nMfg. Lic. No. MNB/20/1116', household).issue, 'makerSide');
  // A brand the app doesn't know, with no contents read.
  const unknown = diagnoseScan('PENTOWOK D PENTOWOK D\nWOCKHARDT', household);
  assert.equal(unknown.issue, 'unknownName');
  assert.ok(unknown.tips[0].includes("what's in"));
});

test('partial and ambiguous fragment reads say so, with the candidates', () => {
  const two = diagnoseScan('…LOPI… 7', household, { twoFit: ['Clopilet 75', 'Clopitab 75'] });
  assert.equal(two.issue, 'twoFit');
  assert.match(two.why, /Clopilet 75, Clopitab 75/);
  const part = diagnoseScan('PANTOPR', household, { partialOf: 'Pan 20' });
  assert.equal(part.issue, 'partialName');
  assert.match(part.why, /may be Pan 20/);
});
