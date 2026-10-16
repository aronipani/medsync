import { test } from 'node:test';
import assert from 'node:assert/strict';
import { photoFileName, uuid } from '../src/uid.ts';

test('uuid: version-4 format, different every time', () => {
  const ids = new Set(Array.from({ length: 200 }, () => uuid()));
  assert.equal(ids.size, 200);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  let x = 0;
  assert.match(uuid(() => ((x = (x * 9301 + 49297) % 233280), x / 233280)), /^[0-9a-f-]{36}$/); // fallback path
});

test('photo file names: time first, then the UUID', () => {
  assert.equal(photoFileName('2026-10-16T02:04:05.123Z', 1, 'abc'), '2026-10-16T02-04-05-123Z-1-abc.jpg');
});
