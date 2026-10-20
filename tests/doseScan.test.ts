// Spec 19: dose-time scanning off in the US unless turned on after the disclosure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOSE_SCAN_DISCLOSURE_VERSION, doseScanOn, inUnitedStates } from '../src/doseScan.ts';

const base = {} as never;
const at = '2026-10-20T10:00:00Z';

test('the US is told by the phone region or a US time zone', () => {
  assert.equal(inUnitedStates({ region: 'US', timeZone: 'America/Los_Angeles' }), true);
  assert.equal(inUnitedStates({ region: 'IN', timeZone: 'America/Chicago' }), true); // Indian phone settings, living in the US
  assert.equal(inUnitedStates({ region: 'IN', timeZone: 'Asia/Kolkata' }), false);
  assert.equal(inUnitedStates({ region: 'CA', timeZone: 'America/Toronto' }), false);
});

test('on by default in India, off by default in the US', () => {
  assert.equal(doseScanOn({ ...(base as object) } as never, false), true);
  assert.equal(doseScanOn({ ...(base as object) } as never, true), false);
});

test('in the US it turns on only with the disclosure read; anyone can turn it off', () => {
  const s = (doseScan: object) => ({ doseScan }) as never;
  assert.equal(doseScanOn(s({ on: true, at }), true), false);
  assert.equal(doseScanOn(s({ on: true, at, disclosure: DOSE_SCAN_DISCLOSURE_VERSION }), true), true);
  assert.equal(doseScanOn(s({ on: false, at }), false), false);
});

test('where the app was set up decides: a parent from India visiting the US keeps scanning', async () => {
  const { setUpInUS } = await import('../src/doseScan.ts');
  assert.equal(doseScanOn({ setupInUS: false } as never), true);
  assert.equal(doseScanOn({ setupInUS: true } as never), false);
  assert.equal(setUpInUS({ setupInUS: false } as never), false);
});
