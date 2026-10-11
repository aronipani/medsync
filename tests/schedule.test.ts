import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMissed, doseTime, dueNow, occurrencesForDate, reminderSlots } from '../src/schedule.ts';
import type { AppState, Medication, Member } from '../src/types.ts';

const ma: Member = { id: 'ma', name: 'Ma', color: '#000', mealTimes: { breakfast: '08:30', lunch: '13:30', dinner: '20:30' } };
const baba: Member = { id: 'baba', name: 'Baba', color: '#111', mealTimes: { breakfast: '07:30', lunch: '13:00', dinner: '20:00' } };
const since = '2026-10-01T00:00:00';

const med = (id: string, memberId: string, doses: Medication['doses'], extra: Partial<Medication> = {}): Medication => ({
  id, memberId, name: id, strength: '1', aliases: [], barcodes: [], unit: 'tablet', doses,
  stock: 10, lowStockAt: 2, active: true, createdAt: since, ...extra,
});

const state = (): AppState => ({
  version: 1,
  members: [ma, baba],
  meds: [
    med('telma', 'ma', [{ id: 'd1', timing: { kind: 'meal', meal: 'breakfast', relation: 'after' }, qty: 1, days: [], since }]),
    med('thyro', 'ma', [{ id: 'd1', timing: { kind: 'meal', meal: 'breakfast', relation: 'before' }, qty: 1, days: [], since }]),
    med('d3', 'baba', [{ id: 'd1', timing: { kind: 'custom', time: '09:00' }, qty: 1, days: [0], since }]), // Sundays
    med('abx', 'baba', [{ id: 'd1', timing: { kind: 'meal', meal: 'dinner', relation: 'after' }, qty: 1, days: [], since }], { endDate: '2026-10-10' }),
  ],
  logs: [],
  stock: [],
  settings: { mealOffsetMin: 30, dueWindowMin: 60, missedAfterMin: 120, followUpMin: 30, snoozeMin: 10 },
});

test('meal-linked dose times follow each member', () => {
  const s = state();
  assert.equal(doseTime(s.meds[0].doses[0], ma, s.settings), '09:00');
  assert.equal(doseTime(s.meds[1].doses[0], ma, s.settings), '08:00');
  assert.equal(doseTime(s.meds[0].doses[0], baba, s.settings), '08:00');
});

test('weekday-only doses and finished courses', () => {
  const s = state();
  const sun = occurrencesForDate(s, '2026-10-11', new Date(2026, 9, 11, 6, 0)); // Sunday
  assert.deepEqual(sun.map((o) => o.med.id), ['thyro', 'd3', 'telma']); // abx ended 10th
  const mon = occurrencesForDate(s, '2026-10-12', new Date(2026, 9, 12, 6, 0));
  assert.ok(!mon.some((o) => o.med.id === 'd3'));
});

test('due window per member', () => {
  const s = state();
  const at = new Date(2026, 9, 11, 8, 10);
  assert.deepEqual(dueNow(s, at, 'ma').map((o) => o.med.id), ['thyro', 'telma']);
  assert.deepEqual(dueNow(s, at, 'baba').map((o) => o.med.id), ['d3']);
});

test('missed doses are logged once the window closes, not for new doses', () => {
  const s = state();
  const at = new Date(2026, 9, 11, 10, 30); // thyro 08:00 + 120 = 10:00 → missed; telma 09:00 still due
  const missed = computeMissed(s, at, () => 'x');
  const ids = missed.filter((m) => m.date === '2026-10-11').map((m) => m.medId);
  assert.deepEqual(ids, ['thyro']);
  // Dose added today at 10:00 must not count as missed for this morning or yesterday.
  s.meds.push(med('new', 'ma', [{ id: 'd1', timing: { kind: 'custom', time: '07:00' }, qty: 1, days: [], since: new Date(2026, 9, 11, 10, 0).toISOString() }]));
  assert.ok(!computeMissed(s, at, () => 'x').some((m) => m.medId === 'new'));
});

test('reminders group by time and split weekday-only times', () => {
  const s = state();
  s.meds.push(med('vit', 'ma', [{ id: 'd1', timing: { kind: 'custom', time: '09:00' }, qty: 1, days: [], since }]));
  const slots = reminderSlots(s);
  const nine = slots.filter((x) => x.time === '09:00');
  assert.equal(nine.length, 7); // 09:00 has a Sunday-only dose → per-weekday reminders
  assert.equal(nine.find((x) => x.weekday === 0)!.lines.length, 3); // telma, vit, d3
  assert.equal(nine.find((x) => x.weekday === 1)!.lines.length, 2);
  assert.ok(slots.find((x) => x.time === '08:00')!.lines.some((l) => l.startsWith('Ma:')));
});
