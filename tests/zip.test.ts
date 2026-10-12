import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, makeZip } from '../src/zip.ts';

test('crc32 matches the standard value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('zip opens with a standard unzip tool', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zip-'));
  const zip = makeZip([
    { name: 'manifest.json', data: new TextEncoder().encode('{"ok":true}') },
    { name: 'Monotrate 10/1.jpg', data: new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]) },
  ]);
  writeFileSync(join(dir, 't.zip'), zip);
  try {
    execFileSync('python3', ['-c', `import zipfile;z=zipfile.ZipFile('${join(dir, 't.zip')}');assert z.testzip() is None;z.extractall('${dir}')`]);
  } catch (e) {
    assert.fail(String(e));
  }
  assert.equal(readFileSync(join(dir, 'manifest.json'), 'utf8'), '{"ok":true}');
  assert.equal(readFileSync(join(dir, 'Monotrate 10', '1.jpg')).length, 7);
});
