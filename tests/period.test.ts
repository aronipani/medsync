import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodOfTime } from '../src/period.ts';

test('time-of-day periods and their boundaries', () => {
  assert.equal(periodOfTime('04:59'), 'night');
  assert.equal(periodOfTime('05:00'), 'morning');
  assert.equal(periodOfTime('11:59'), 'morning');
  assert.equal(periodOfTime('12:00'), 'afternoon');
  assert.equal(periodOfTime('16:59'), 'afternoon');
  assert.equal(periodOfTime('17:00'), 'evening');
  assert.equal(periodOfTime('20:59'), 'evening');
  assert.equal(periodOfTime('21:00'), 'night');
  assert.equal(periodOfTime('00:30'), 'night');
});
