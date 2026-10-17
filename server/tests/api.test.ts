import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { CATALOGUE_MIN, handle, type Deps } from '../src/api.ts';
import type { Req, Res } from '../src/http.ts';
import { MemoryBlobs, MemoryKV } from '../src/store/memory.ts';
import { keysFrom, open, seal } from './phone.ts';

// A tiny valid JPEG with an EXIF (APP1) segment carrying fake GPS text.
const exif = Buffer.from('Exif\0\0GPS 22.5726N 88.3639E');
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8]),
  Buffer.from([0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1'),
  Buffer.from([0xff, 0xe1]), Buffer.from([0, exif.length + 2]), exif,
  Buffer.from([0xff, 0xda, 0x00, 0x02]), Buffer.from([1, 2, 3, 4]),
  Buffer.from([0xff, 0xd9]),
]);

function setup(over: Partial<Deps> = {}) {
  let t = Date.UTC(2026, 9, 16, 9);
  const seen: Buffer[][] = [];
  const deps: Deps = {
    kv: new MemoryKV(() => t),
    blobs: new MemoryBlobs(),
    reader: {
      read: async (photos) => {
        seen.push(photos);
        return {
          brand: 'Clopilet', strength: '75 mg', generic: 'Clopidogrel', maker: 'Sun Pharma', tokens: ['clopilet', '75', 'CLOPIDOGREL', 'B.NO 123'],
          grid: { rows: 2, cols: 5 }, regions: [{ cls: 'brand', box: [0.1, 0.1, 0.5, 0.2] }], expiry: '2027-08',
          lookAlikes: ['Clopitab'], confidence: { brand: 0.95, strength: 0.9, maker: 0.4 },
        };
      },
    },
    installSecret: 'test-secret',
    modelCallsPerDay: 100,
    now: () => t,
    ...over,
  };
  const call = (method: string, path: string, o: { body?: unknown; raw?: Buffer; headers?: Record<string, string>; query?: Record<string, string> } = {}): Promise<Res> =>
    handle(
      {
        method,
        path,
        query: o.query ?? {},
        headers: o.headers ?? {},
        body: o.raw ?? (o.body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(o.body))),
      } satisfies Req,
      deps,
    );
  const install = async () => {
    const r = await call('POST', '/v1/install');
    assert.equal(r.status, 201);
    return { authorization: `Install ${(r.body as { token: string }).token}` };
  };
  return { deps, call, install, seen, tick: (ms: number) => (t += ms) };
}

test('health and unknown routes', async () => {
  const { call } = setup();
  assert.equal((await call('GET', '/v1/health')).status, 200);
  assert.equal((await call('GET', '/v1/nope')).status, 404);
  assert.equal((await call('GET', '/v1/install')).status, 405);
});

test('install tokens are needed and checked', async () => {
  const { call } = setup();
  assert.equal((await call('POST', '/v1/strip/read', { body: { photos: [] } })).status, 401);
  const forged = `Install ${randomBytes(16).toString('base64url')}.${randomBytes(16).toString('base64url')}`;
  assert.equal((await call('POST', '/v1/strip/read', { body: { photos: [JPEG.toString('base64')] }, headers: { authorization: forged } })).status, 401);
});

test('strip read: photos are cleaned before the model sees them, the answer is checked', async () => {
  const { call, install, seen } = setup();
  const h = await install();
  const r = await call('POST', '/v1/strip/read', { body: { photos: [JPEG.toString('base64')] }, headers: h });
  assert.equal(r.status, 200);
  const sent = seen[0][0];
  assert.ok(!sent.includes(Buffer.from('GPS')), 'EXIF removed');
  assert.ok(sent.includes(Buffer.from('JFIF')));
  const { profile, unsure } = r.body as { profile: Record<string, unknown>; unsure: string[] };
  assert.equal(profile.brand, 'Clopilet');
  assert.equal(profile.maker, undefined); // confidence 0.4
  assert.deepEqual(unsure, ['maker']);
  assert.deepEqual(profile.tokens, ['CLOPILET', '75', 'CLOPIDOGREL']); // "B.NO 123" refused
  assert.equal(profile.expiry, '2027-08');
});

test('strip read refuses non-JPEG and too many photos', async () => {
  const { call, install } = setup();
  const h = await install();
  assert.equal((await call('POST', '/v1/strip/read', { body: { photos: [Buffer.from('GIF89a').toString('base64')] }, headers: h })).status, 415);
  const p = JPEG.toString('base64');
  assert.equal((await call('POST', '/v1/strip/read', { body: { photos: [p, p, p] }, headers: h })).status, 400);
});

test('strip read: per-install limit and global model budget', async () => {
  const { call, install, tick } = setup({ modelCallsPerDay: 4 });
  const h = await install();
  const read = () => call('POST', '/v1/strip/read', { body: { photos: [JPEG.toString('base64')] }, headers: h });
  for (let i = 0; i < 3; i++) assert.equal((await read()).status, 200);
  assert.equal((await read()).status, 429); // 3 per minute
  tick(61_000);
  assert.equal((await read()).status, 200);
  const other = await install();
  const r = await call('POST', '/v1/strip/read', { body: { photos: [JPEG.toString('base64')] }, headers: other });
  assert.equal(r.status, 503); // 5th model call today
});

test('strip read: model failure is a clean 502', async () => {
  const { call, install } = setup({ reader: { read: async () => { throw new Error('boom'); } } });
  const r = await call('POST', '/v1/strip/read', { body: { photos: [JPEG.toString('base64')] }, headers: await install() });
  assert.equal(r.status, 502);
});

test('catalogue: offered only after enough confirmations; expiry never stored', async () => {
  const { call, install, deps } = setup();
  const profile = { brand: 'Clopilet', strength: '75 mg', maker: 'Sun Pharma', tokens: ['CLOPILET', '75'], grid: { rows: 2, cols: 5 }, expiry: '2027-08' };
  const get = async () => (await call('GET', '/v1/catalogue', { query: { brand: 'clopilet', strength: '75' }, headers: await install() })).body as { matches: unknown[] };
  for (let i = 0; i < CATALOGUE_MIN; i++) {
    assert.equal((await get()).matches.length, 0);
    const r = await call('POST', '/v1/catalogue', { body: { profile }, headers: await install() });
    assert.equal(r.status, 201);
  }
  const m = (await get()).matches as { profile: Record<string, unknown>; confirmations: number }[];
  assert.equal(m.length, 1);
  assert.equal(m[0].confirmations, CATALOGUE_MIN);
  assert.equal(m[0].profile.expiry, undefined);
  assert.ok(![...(deps.kv as MemoryKV).items.values()].some((i) => JSON.stringify(i).includes('2027-08')));
});

test('vault: encrypted backup round trip, wrong token refused, previous version kept', async () => {
  const { call, install, deps } = setup();
  const h = await install();
  const k = keysFrom(randomBytes(32), 'vault');
  const save = (text: string, extra: Record<string, string> = {}) =>
    call('PUT', `/v1/vault/${k.id}`, { raw: seal(k.enc, Buffer.from(text)), headers: { ...h, 'x-vault-token': k.token, ...extra } });
  assert.equal((await save('{"backup":1}')).status, 201);
  assert.equal((await save('{"backup":2}')).status, 201);
  // Nothing readable on the server.
  for (const b of (deps.blobs as MemoryBlobs).files.values()) assert.ok(!b.includes(Buffer.from('backup')));
  const latest = await call('GET', `/v1/vault/${k.id}`, { headers: { ...h, 'x-vault-token': k.token } });
  assert.equal(open(k.enc, latest.body as Buffer).toString(), '{"backup":2}');
  const prev = await call('GET', `/v1/vault/${k.id}`, { query: { version: 'previous' }, headers: { ...h, 'x-vault-token': k.token } });
  assert.equal(open(k.enc, prev.body as Buffer).toString(), '{"backup":1}');
  const other = keysFrom(randomBytes(32), 'vault');
  assert.equal((await call('GET', `/v1/vault/${k.id}`, { headers: { ...h, 'x-vault-token': other.token } })).status, 403);
  assert.equal((await save('{"backup":3}', { 'if-match': '1' })).status, 409); // another phone saved version 2
  assert.equal((await call('DELETE', `/v1/vault/${k.id}`, { headers: { ...h, 'x-vault-token': k.token } })).status, 204);
  assert.equal((await call('GET', `/v1/vault/${k.id}`, { headers: { ...h, 'x-vault-token': k.token } })).status, 404);
  assert.equal((deps.blobs as MemoryBlobs).files.size, 0);
});

test('vault: only two versions are kept', async () => {
  const { call, install, deps } = setup();
  const h = await install();
  const k = keysFrom(randomBytes(32), 'vault');
  for (let i = 0; i < 5; i++) await call('PUT', `/v1/vault/${k.id}`, { raw: seal(k.enc, Buffer.from(`b${i}`)), headers: { ...h, 'x-vault-token': k.token } });
  assert.equal((deps.blobs as MemoryBlobs).files.size, 2);
});

test('circle: family phones share encrypted activity; outsiders and old events are shut out', async () => {
  const { call, install, tick } = setup();
  const k = keysFrom(randomBytes(32), 'circle');
  const ma = { ...(await install()), 'x-circle-token': k.token };
  const son = { ...(await install()), 'x-circle-token': k.token };
  const ev = (o: unknown) => seal(k.enc, Buffer.from(JSON.stringify(o))).toString('base64url');
  const post = await call('POST', `/v1/circle/${k.id}/events`, { body: { events: [ev({ kind: 'taken', med: 'Clopilet 75', at: '09:05' })] }, headers: ma });
  assert.equal(post.status, 201);
  const got = (await call('GET', `/v1/circle/${k.id}/events`, { headers: son })).body as { events: { data: string; id: string }[]; cursor: string };
  assert.equal(got.events.length, 1);
  assert.equal(JSON.parse(open(k.enc, Buffer.from(got.events[0].data, 'base64url')).toString()).med, 'Clopilet 75');
  // Only newer events after the cursor.
  tick(1000);
  await call('POST', `/v1/circle/${k.id}/events`, { body: { events: [ev({ kind: 'missed' })] }, headers: ma });
  const next = (await call('GET', `/v1/circle/${k.id}/events`, { query: { after: got.cursor }, headers: son })).body as { events: unknown[] };
  assert.equal(next.events.length, 1);
  // Wrong key.
  const stranger = keysFrom(randomBytes(32), 'circle');
  assert.equal((await call('GET', `/v1/circle/${k.id}/events`, { headers: { ...son, 'x-circle-token': stranger.token } })).status, 403);
  // Events go after 30 days.
  tick(31 * 86_400_000);
  const late = (await call('GET', `/v1/circle/${k.id}/events`, { headers: son })).body as { events: unknown[] };
  assert.equal(late.events.length, 0);
  assert.equal((await call('DELETE', `/v1/circle/${k.id}`, { headers: ma })).status, 204);
  assert.equal((await call('GET', `/v1/circle/${k.id}/events`, { headers: son })).status, 404);
});

test('circle refuses plain-text-looking or oversized events', async () => {
  const { call, install } = setup();
  const k = keysFrom(randomBytes(32), 'circle');
  const h = { ...(await install()), 'x-circle-token': k.token };
  assert.equal((await call('POST', `/v1/circle/${k.id}/events`, { body: { events: ['Ma took Clopilet at 9'] }, headers: h })).status, 400);
  assert.equal((await call('POST', `/v1/circle/${k.id}/events`, { body: { events: ['A'.repeat(3000)] }, headers: h })).status, 400);
});

test('training photo: cleaned, filed by month, record holds only the allowed fields', async () => {
  const { call, install, deps } = setup();
  const r = await call('POST', '/v1/photos', {
    body: { photo: JPEG.toString('base64'), name: ' Clopilet 75 ', appVersion: '1.0.0 · build-30', platform: 'android', member: 'Ma', textRead: 'Mrs Sen', at: '09:05' },
    headers: await install(),
  });
  assert.equal(r.status, 201);
  const files = [...(deps.blobs as MemoryBlobs).files.entries()];
  assert.equal(files.length, 2);
  for (const [key, data] of files) {
    assert.match(key, /^training\/2026-10\//);
    assert.ok(!data.includes(Buffer.from('GPS')));
  }
  const record = JSON.parse(files.find(([k]) => k.endsWith('.json'))![1].toString());
  assert.deepEqual(record, { name: 'Clopilet 75', month: '2026-10', appVersion: '1.0.0 · build-30', platform: 'android' });
});

test('training photo: helper details are whitelisted and capped; nothing about the person is kept', async () => {
  const { call, install, deps } = setup();
  const details = {
    strength: '75', contents: 'Clopidogrel 75 mg', how: 'failed-scan', unlabelled: true, reason: 'Red: looks like Clopitab',
    reader: 'apple-vision', ocrText: 'CLOPILET 75 Batch 123', yolo: '0 0.1 0.1 0.5 0.1 0.5 0.2 0.1 0.2',
    regions: [{ cls: 'brand', text: 'CLOPILET', extra: 'x' }], trace: { regions: [], steps: [] },
    phone: 'abc-install-id', at: '2026-10-16T09:05:00Z', member: 'Ma', how2: 'nope',
  };
  const r = await call('POST', '/v1/photos', { body: { photo: JPEG.toString('base64'), name: 'Clopilet', details }, headers: await install() });
  assert.equal(r.status, 201);
  const record = JSON.parse([...(deps.blobs as MemoryBlobs).files.entries()].find(([k]) => k.endsWith('.json'))![1].toString());
  assert.equal(record.strength, '75');
  assert.equal(record.how, 'failed-scan');
  assert.equal(record.unlabelled, true);
  assert.deepEqual(record.regions, [{ cls: 'brand', text: 'CLOPILET' }]);
  for (const k of ['phone', 'at', 'member', 'how2']) assert.equal(record[k], undefined, k);
  // A bad "how" and a non-numeric label are dropped.
  const r2 = await call('POST', '/v1/photos', { body: { photo: JPEG.toString('base64'), details: { how: 'other', yolo: 'rm -rf' } }, headers: await install() });
  assert.equal(r2.status, 201);
});

test('nothing stored links data to an install token', async () => {
  const { call, install, deps } = setup();
  const h = await install();
  const token = h.authorization.split(' ')[1];
  const k = keysFrom(randomBytes(32), 'vault');
  await call('PUT', `/v1/vault/${k.id}`, { raw: seal(k.enc, Buffer.from('x')), headers: { ...h, 'x-vault-token': k.token } });
  const dump = JSON.stringify([...(deps.kv as MemoryKV).items.values()]);
  assert.ok(!dump.includes(token) && !dump.includes(token.split('.')[0]));
  assert.ok(!dump.includes(k.token), 'vault token stored only as a hash');
});
