import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestPerMed, decideLook } from '../src/lookMatch.ts';

test('closest saved photo per medicine; unreadable references ignored', () => {
  const refs = [{ medId: 'a' }, { medId: 'a' }, { medId: 'b' }, { medId: 'c' }];
  assert.deepEqual(bestPerMed(refs, [0.5, 0.3, 0.8, -1]), [
    { medId: 'a', distance: 0.3 },
    { medId: 'b', distance: 0.8 },
  ]);
});

test('a clear look match names the medicine', () => {
  const v = decideLook([{ medId: 'a', distance: 0.3 }, { medId: 'b', distance: 0.8 }], 2);
  assert.equal(v.kind === 'look' && v.medId, 'a');
});

test('too far from every saved strip, or two strips nearly as close: no look evidence', () => {
  assert.deepEqual(decideLook([{ medId: 'a', distance: 0.9 }], 2), { kind: 'none', why: 'too-far' });
  assert.deepEqual(decideLook([{ medId: 'a', distance: 0.4 }, { medId: 'b', distance: 0.45 }], 2), { kind: 'none', why: 'too-close-call' });
  assert.deepEqual(decideLook([], 2), { kind: 'none', why: 'no-photos' });
});

test('older iPhones (revision 1 prints) use their own scale', () => {
  assert.equal(decideLook([{ medId: 'a', distance: 10 }], 1).kind, 'look');
  assert.equal(decideLook([{ medId: 'a', distance: 10 }], 2).kind, 'none');
});
