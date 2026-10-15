import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DATA_POINTS, NOTICE_VERSION, needsNotice } from '../src/legal.ts';

test('the notice shows until the current version is accepted', () => {
  assert.equal(needsNotice({}), true);
  assert.equal(needsNotice({ acceptedNotice: NOTICE_VERSION - 1 }), true);
  assert.equal(needsNotice({ acceptedNotice: NOTICE_VERSION }), false);
});

test('the data statement names every way data can leave the phone, and PRIVACY.md agrees', () => {
  const all = DATA_POINTS.join(' ');
  for (const w of ['backup', 'training', 'ML Kit']) assert.ok(all.includes(w), w);
  const policy = readFileSync(fileURLToPath(new URL('../PRIVACY.md', import.meta.url).href), 'utf8');
  for (const w of ['backup', 'training', 'ML Kit', 'no account']) assert.ok(policy.toLowerCase().includes(w.toLowerCase()), `PRIVACY.md: ${w}`);
});
