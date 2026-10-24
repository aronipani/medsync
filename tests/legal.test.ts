import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dataPoints, NOTICE_VERSION, needsNotice } from '../src/legal.ts';

test('the notice shows until the current version is accepted', () => {
  assert.equal(needsNotice({}), true);
  assert.equal(needsNotice({ acceptedNotice: NOTICE_VERSION - 1 }), true);
  assert.equal(needsNotice({ acceptedNotice: NOTICE_VERSION }), false);
});

test('the data statement names every way data can leave the phone, and PRIVACY.md agrees', () => {
  for (const os of ['ios', 'android']) {
    const all = dataPoints(os).join(' ');
    for (const w of ['backup', 'training', 'ML Kit']) assert.ok(all.includes(w), `${os}: ${w}`);
  }
  assert.ok(dataPoints('ios').join(' ').includes('Apple Vision'));
  assert.ok(!dataPoints('android').join(' ').includes('Apple'));
  const policy = readFileSync(fileURLToPath(new URL('../PRIVACY.md', import.meta.url).href), 'utf8');
  for (const w of ['backup', 'training', 'ML Kit', 'Apple Vision', 'email', 'no account']) assert.ok(policy.toLowerCase().includes(w.toLowerCase()), `PRIVACY.md: ${w}`);
});

test('the terms of use are linked, versioned, and agree with the notice', async () => {
  const { TERMS_POINTS, TERMS_VERSION, TERMS_URL } = await import('../src/legal.ts');
  const terms = readFileSync(fileURLToPath(new URL('../TERMS.md', import.meta.url).href), 'utf8');
  assert.ok(terms.includes(`Version ${TERMS_VERSION}`), 'TERMS.md version matches TERMS_VERSION');
  assert.equal(TERMS_URL, 'https://aronipani.github.io/takesure/terms/');
  for (const w of ['as is', 'not a medical device', 'FDA', 'consumer law', 'permission', '911', '112']) assert.ok(terms.toLowerCase().includes(w.toLowerCase()), `TERMS.md: ${w}`);
  assert.ok(TERMS_POINTS.join(' ').includes('consumer law'));
});
