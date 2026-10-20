// Spec 20: one person's medicines sent between phones (parent in India, caregiver in California).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPerson, makePersonFile, mergePerson, parsePersonFile } from '../src/personFile.ts';

const settings = { mealOffsetMin: 15, dueWindowMin: 30, missedAfterMin: 120, followUpMin: 0, testReminderMin: 0, snoozeMin: 10 } as never;
const meals = { breakfast: '08:30', lunch: '13:30', dinner: '20:30' };
const dose = (id: string, time: string) => ({ id, timing: { kind: 'custom' as const, time }, qty: 1, days: [], since: '2026-10-01T00:00:00Z' });
const med = (id: string, memberId: string, name: string, extra: object = {}) =>
  ({ id, memberId, name, strength: '5', aliases: [], barcodes: [], unit: 'tablet', doses: [dose(`${id}-d`, '08:30')], stock: 20, lowStockAt: 5, active: true, createdAt: '2026-10-01T00:00:00Z', ...extra }) as never;
const log = (medId: string, memberId: string, date: string, method: string, status = 'taken', at = `${date}T03:00:00Z`) =>
  ({ id: `${medId}${date}${method}`, key: `${date}|${medId}|${medId}-d`, memberId, medId, medName: medId, date, time: '08:30', status, method, qty: 1, at }) as never;

// The caregiver's phone in California: Me, and Ma (lives in India) with two medicines.
const caregiver = {
  version: 1,
  members: [
    { id: 'me', name: 'Aroni', color: '#000', mealTimes: meals },
    { id: 'ma', name: 'Ma', color: '#c00', mealTimes: meals, timeZone: 'Asia/Kolkata', language: 'bn' },
  ],
  meds: [med('amlong', 'ma', 'Amlong'), med('thyrox', 'ma', 'Thyrox', { profile: { version: 1, source: 'phone', at: 'x', words: ['THYROX'], sides: 1, anchors: ['profiles/a.jpg'] } }), med('mine', 'me', 'Mine')],
  logs: [log('mine', 'me', '2026-10-19', 'manual')],
  stock: [],
  settings,
} as never;

test("the file has only that person, their time zone, and no photo paths", () => {
  const f = makePersonFile(caregiver, 'ma', 'America/Los_Angeles', new Date('2026-10-20T10:00:00Z'));
  assert.equal(f.member.timeZone, 'Asia/Kolkata');
  assert.deepEqual(f.meds.map((m) => m.name).sort(), ['Amlong', 'Thyrox']);
  assert.equal(f.logs.length, 0);
  assert.deepEqual(f.meds.find((m) => m.name === 'Thyrox')!.profile!.anchors, []);
  // Someone living with the phone gets the phone's zone written out.
  assert.equal(makePersonFile(caregiver, 'me', 'America/Los_Angeles').member.timeZone, 'America/Los_Angeles');
});

test("Ma's phone in India: added as her, on her own clock; then her records go back to the caregiver", () => {
  const f = parsePersonFile(JSON.stringify(makePersonFile(caregiver, 'ma', 'America/Los_Angeles')));
  assert.ok(f.ok);
  // Ma's phone already has someone called "Ma" (made on first run, different id): she chooses to update her.
  const maPhone = { version: 1, members: [{ id: 'm0', name: 'Ma', color: '#090', mealTimes: { breakfast: '08:00', lunch: '13:00', dinner: '21:00' } }],
    meds: [med('amlong-local', 'm0', 'Amlong', { stock: 7 })], logs: [log('amlong-local', 'm0', '2026-10-19', 'manual')], stock: [], settings } as never;
  assert.equal(findPerson(maPhone, f.file).sameName?.id, 'm0');
  const r = mergePerson(maPhone, f.file, 'Asia/Kolkata', 'm0');
  const ma = r.state.members.find((m) => m.id === 'm0')!;
  assert.equal(ma.timeZone, undefined); // she lives with this phone
  assert.equal(ma.language, 'bn');
  assert.equal(ma.color, '#090'); // this phone's colour kept
  const amlong = r.state.meds.find((m) => m.name === 'Amlong')!;
  assert.equal(amlong.id, 'amlong-local'); // matched by name, not duplicated
  assert.equal(amlong.stock, 7); // her count of tablets stays
  assert.equal(r.state.meds.filter((m) => m.memberId === 'm0').length, 2);
  assert.deepEqual(r.changes.map((c) => c.kind), ['added']); // Thyrox

  // Ma takes her doses; her phone sends her file back. The caregiver's phone gets the records, mapped to its ids.
  const maAfter = { ...r.state, logs: [...r.state.logs, log('amlong-local', 'm0', '2026-10-20', 'barcode')] } as never;
  const back = makePersonFile(maAfter, 'm0', 'Asia/Kolkata');
  assert.equal(back.member.timeZone, 'Asia/Kolkata');
  const c = mergePerson(caregiver, back, 'America/Los_Angeles', 'ma');
  assert.equal(c.state.members.find((m) => m.id === 'ma')!.timeZone, 'Asia/Kolkata');
  const got = c.state.logs.filter((l) => l.memberId === 'ma');
  assert.deepEqual(got.map((l) => l.key).sort(), ['2026-10-19|amlong|amlong-local-d', '2026-10-20|amlong|amlong-local-d']);
  assert.equal(c.logsAdded, 2);
  assert.equal(c.state.meds.find((m) => m.id === 'thyrox')!.profile!.anchors![0], 'profiles/a.jpg'); // caregiver's own photo kept
  assert.equal(c.state.meds.filter((m) => m.memberId === 'me').length, 1); // nobody else touched
});

test('a medicine removed on the other phone is paused here, not deleted; a taken record beats an automatic missed', () => {
  const f = makePersonFile({ ...(caregiver as object), meds: [med('amlong', 'ma', 'Amlong')] } as never, 'ma', 'America/Los_Angeles');
  f.logs = [log('amlong', 'ma', '2026-10-20', 'manual')];
  const here = { ...(caregiver as object), logs: [log('amlong', 'ma', '2026-10-20', 'auto', 'missed')] } as never;
  const r = mergePerson(here, f, 'America/Los_Angeles', 'ma');
  const thyrox = r.state.meds.find((m) => m.id === 'thyrox')!;
  assert.equal(thyrox.active, false);
  assert.ok(r.changes.some((c) => c.kind === 'stopped' && c.medName.startsWith('Thyrox')));
  assert.equal(r.state.logs.find((l) => l.key === '2026-10-20|amlong|amlong-d')!.status, 'taken');
});

test('wrong files are refused with a clear reason', () => {
  assert.equal(parsePersonFile('not json').ok, false);
  const backup = parsePersonFile(JSON.stringify({ app: 'medsync', kind: 'backup', format: 1 }));
  assert.ok(!backup.ok && /full backup/.test(backup.error));
  const newer = parsePersonFile(JSON.stringify({ app: 'medsync', kind: 'person', format: 99 }));
  assert.ok(!newer.ok && /newer version/.test(newer.error));
});
