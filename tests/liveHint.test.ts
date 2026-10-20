import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveHint } from '../src/liveHint.ts';

test('no strip in view yet', () => {
  assert.equal(liveHint([], 1280).state, 'nothing');
  assert.equal(liveHint([{ text: 'a 1', height: 30 }], 1280).state, 'nothing');
});

test('print too small: bring it closer', () => {
  assert.equal(liveHint([{ text: 'Pantodac 40', height: 12 }, { text: 'Pantoprazole tablets', height: 8 }], 1280).state, 'far');
});

test('big enough print: read it', () => {
  assert.equal(liveHint([{ text: 'Pantodac 40', height: 40 }, { text: 'Pantoprazole tablets', height: 14 }], 1280).state, 'ready');
});
