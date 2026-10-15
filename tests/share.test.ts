import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shareRecord, sharingAvailable } from '../src/share.ts';

test('only month, app version, platform and a typed name are ever sent', () => {
  const r = shareRecord({
    takenAt: new Date(2026, 9, 15, 21, 7),
    appVersion: '1.0.0',
    platform: 'ios',
    typedName: '  Kerendia   10 ',
    ocrText: 'Patient: Ramesh Kumar, Apollo Pharmacy',
    memberId: 'm1',
    deviceId: 'abc',
    location: { lat: 22.5, lon: 88.3 },
  });
  assert.deepEqual(r, { month: '2026-10', appVersion: '1.0.0', platform: 'ios', medicine: 'Kerendia 10' });
});

test('empty or long names, unknown platforms', () => {
  const r = shareRecord({ takenAt: new Date(2026, 0, 2), appVersion: '1.0.0', platform: 'web', typedName: '   ' });
  assert.deepEqual(r, { month: '2026-01', appVersion: '1.0.0', platform: 'android' });
  assert.equal(shareRecord({ takenAt: new Date(), appVersion: '1', platform: 'android', typedName: 'x'.repeat(200) }).medicine?.length, 60);
});

test('sharing stays hidden until an https endpoint is configured', () => {
  assert.equal(sharingAvailable(''), false);
  assert.equal(sharingAvailable('http://example.com/upload'), false);
  assert.equal(sharingAvailable('https://example.com/upload'), true);
  assert.equal(sharingAvailable(), false);
});
