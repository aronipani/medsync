import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readOnServer, shouldAskServer } from '../src/serverFallback.ts';

test('the server is asked only after repeated weak reads', () => {
  assert.equal(shouldAskServer(1), false);
  assert.equal(shouldAskServer(2), true);
});

test('stub: the server fallback is not built yet and never gives an answer', async () => {
  assert.deepEqual(await readOnServer(['a.jpg'], []), { kind: 'unavailable', why: 'not-built' });
});
