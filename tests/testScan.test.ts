import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyTest, readinessOf, readinessSummary, recordFor, testReminders, upcomingReadiness, TEST_VALID_DAYS } from '../src/testScan.ts';
import type { AppState, Medication, Member } from '../src/types.ts';

const ma: Member = { id: 'ma', name: 'Ma', color: '#000', mealTimes: { breakfast: '08:30', lunch: '13:30', dinner: '20:30' } };
const since = '2026-10-01T00:00:00';
const med = (id: string, name: string, strength: string, doses: Medication['doses'], extra: Partial<Medication> = {}): Medication => ({
  id, memberId: 'ma', name, strength, aliases: [], barcodes: [], unit: 'tablet', doses, stock: 10, lowStockAt: 2, active: true, createdAt: since, ...extra,
});
const at = (time: string) => [{ id: 'd1', timing: { kind: 'custom' as const, time }, qty: 1, days: [], since }];

const meds = [med('clo', 'Clopilet', '75', at('09:00')), med('tide', 'Tide', '10', at('20:00')), med('cord', 'Cordarone X', '200', at('14:00'))];
const state = (): AppState => ({
  version: 1,
  members: [ma],
  meds,
  logs: [],
  stock: [],
  settings: { mealOffsetMin: 30, dueWindowMin: 60, missedAfterMin: 120, followUpMin: 30, snoozeMin: 10, testReminderMin: 60 },
});

test('a test scan is checked against every medicine, not only the ones due', () => {
  const r = classifyTest('Torsemide Tablets I.P.\nTIDE-10\nEach uncoated tablet contains Torsemide I.P. 10 mg', meds);
  assert.equal(r.kind, 'ok');
  assert.equal(r.kind === 'ok' && r.med.id, 'tide');
});

test('name without strength asks for a check; a different strength is flagged; nothing read is unknown', () => {
  assert.equal(classifyTest('CLOPILET', meds).kind, 'check');
  const s = classifyTest('CLOPILET 150\nClopidogrel 150 mg', meds);
  assert.equal(s.kind, 'strength');
  assert.deepEqual(s.kind === 'strength' && s.found, ['150']);
  assert.equal(classifyTest('Keep out of reach of children', meds).kind, 'unknown');
});

test('inactive medicines are not matched', () => {
  const stopped = [med('clo', 'Clopilet', '75', at('09:00'), { active: false })];
  assert.equal(classifyTest('CLOPILET 75\nClopidogrel 75 mg', stopped).kind, 'unknown');
});

test('records: ok, check or failed against the medicine; nothing for an unknown strip', () => {
  const now = new Date(2026, 9, 15, 10, 0);
  assert.equal(recordFor({ kind: 'ok', med: meds[0] }, { seconds: 3 }, now)?.record.result, 'ok');
  assert.equal(recordFor({ kind: 'check', med: meds[0] }, {}, now)?.record.result, 'check');
  assert.equal(recordFor({ kind: 'conflict', med: meds[0], looksLike: 'Plavix' }, {}, now)?.record.result, 'failed');
  assert.equal(recordFor({ kind: 'unknown' }, {}, now), null);
});

test('readiness: untested, ready, needs a check, and stale after the valid period', () => {
  const now = new Date(2026, 9, 15, 10, 0);
  assert.equal(readinessOf(undefined, now), 'untested');
  assert.equal(readinessOf({ at: new Date(2026, 9, 14).toISOString(), result: 'ok' }, now), 'ready');
  assert.equal(readinessOf({ at: new Date(2026, 9, 14).toISOString(), result: 'check' }, now), 'check');
  const old = new Date(now.getTime() - (TEST_VALID_DAYS + 1) * 864e5).toISOString();
  assert.equal(readinessOf({ at: old, result: 'ok' }, now), 'stale');
});

test('upcoming medicines in the next 24 hours, soonest first, once each, with their test state', () => {
  const now = new Date(2026, 9, 15, 10, 0); // after the 09:00 Clopilet dose (still due), before 14:00 and 20:00
  const records = { tide: { at: new Date(2026, 9, 15, 9, 0).toISOString(), result: 'ok' as const } };
  const list = upcomingReadiness(state(), records, now);
  assert.deepEqual(
    list.map((u) => [u.med.id, u.date, u.time, u.readiness]),
    [
      ['clo', '2026-10-15', '09:00', 'untested'], // due now (inside the window)
      ['cord', '2026-10-15', '14:00', 'untested'],
      ['tide', '2026-10-15', '20:00', 'ready'],
    ],
  );
  assert.deepEqual(readinessSummary(list), { ready: 1, total: 3 });
  // Late evening: tomorrow morning's dose is within 24 hours.
  const late = upcomingReadiness(state(), {}, new Date(2026, 9, 15, 23, 0));
  assert.deepEqual(late.map((u) => [u.med.id, u.date]), [['clo', '2026-10-16'], ['cord', '2026-10-16'], ['tide', '2026-10-16']]);
});

test('test-scan reminders: an hour before each dose time whose medicines are not ready, skipping past ones', () => {
  const now = new Date('2026-10-15T08:30:00');
  const r = testReminders(state(), {}, now, 60, 48);
  // Today's 09:00 reminder (08:00) has passed; the window ends at 08:30 on the 17th.
  assert.deepEqual(
    r.map((x) => `${x.date} ${x.time} @${x.when.getHours()}:${String(x.when.getMinutes()).padStart(2, '0')}`),
    ['2026-10-15 14:00 @13:00', '2026-10-15 20:00 @19:00', '2026-10-16 09:00 @8:00', '2026-10-16 14:00 @13:00', '2026-10-16 20:00 @19:00'],
  );
  assert.deepEqual(r[0].lines, ['Cordarone X 200 — not tested yet']);
});

test('test-scan reminders: passed tests are skipped, failed / unread ones say why, 0 turns them off', () => {
  const now = new Date('2026-10-15T08:30:00');
  const recent = new Date('2026-10-14T20:00:00').toISOString();
  const records = { clo: { at: recent, result: 'ok' as const }, tide: { at: recent, result: 'failed' as const }, cord: { at: recent, result: 'check' as const } };
  const r = testReminders(state(), records, now, 60, 24);
  assert.deepEqual(
    r.map((x) => [x.time, x.lines]),
    [
      ['14:00', ['Cordarone X 200 — strength not read last time']],
      ['20:00', ['Tide 10 — last test failed']],
    ],
  );
  assert.deepEqual(testReminders(state(), {}, now, 0), []);
});

test('test-scan reminders: a pass that will be over a month old at dose time no longer counts', () => {
  const now = new Date('2026-10-15T08:30:00');
  const at = new Date(now.getTime() - 29.5 * 864e5).toISOString();
  const all = { clo: { at, result: 'ok' as const }, tide: { at, result: 'ok' as const }, cord: { at, result: 'ok' as const } };
  const r = testReminders(state(), all, now, 60, 48);
  assert.equal(r[0].date, '2026-10-16'); // nothing today: still valid at 14:00 and 20:00
  assert.match(r[0].lines[0], /tested over a month ago/);
});

test('test-scan reminders name the person when there are several', () => {
  const s = state();
  s.members = [...s.members, { ...ma, id: 'pa', name: 'Pa' }];
  s.meds = [...s.meds, med('neb', 'Nebicard', '2.5', at('14:00'), { memberId: 'pa' })];
  const r = testReminders(s, {}, new Date('2026-10-15T08:30:00'), 60, 12);
  assert.deepEqual(r[0].lines.sort(), ['Ma: Cordarone X 200 — not tested yet', 'Pa: Nebicard 2.5 — not tested yet']);
});

test('a cut strip is recognised the same way as on the Scan tab', () => {
  const r = classifyTest('…OPILE… 75', meds);
  assert.equal(r.kind === 'ok' || r.kind === 'check' ? r.med.id : r.kind, 'clo');
  // A word-list hint alone is never "ok".
  const h = classifyTest('C…', meds, ['CLOPILET 75']);
  assert.deepEqual([h.kind, h.kind === 'check' && h.partial], ['check', true]);
});
