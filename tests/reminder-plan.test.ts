// Review 24 Oct 2026: reminders stay under iOS's 64, stop when a course ends, skip other-time-zone members,
// and a late-night dose can still be confirmed after midnight.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOSE_REMINDER_MAX, dueNow, followUps, reminderPlan } from '../src/schedule.ts';
import type { AppState, Medication, Member } from '../src/types.ts';

const since = '2026-10-01T00:00:00';
const me: Member = { id: 'me', name: 'Me', color: '#000', mealTimes: { breakfast: '08:00', lunch: '13:00', dinner: '20:00' } };
const ma: Member = { id: 'ma', name: 'Ma', color: '#111', mealTimes: { breakfast: '08:30', lunch: '13:30', dinner: '20:30' }, timeZone: 'Asia/Kolkata' };
const settings = { mealOffsetMin: 30, dueWindowMin: 60, missedAfterMin: 120, followUpMin: 30, snoozeMin: 10, testReminderMin: 60 };

const med = (id: string, memberId: string, time: string, extra: Partial<Medication> = {}, days: number[] = []): Medication => ({
  id, memberId, name: id, strength: '5', aliases: [], barcodes: [], unit: 'tablet',
  doses: [{ id: `${id}-d`, timing: { kind: 'custom', time }, qty: 1, days, since }],
  stock: 30, lowStockAt: 2, active: true, createdAt: since, ...extra,
});
const stateOf = (meds: Medication[], members: Member[] = [me]): AppState =>
  ({ version: 1, members, meds, logs: [], stock: [], settings } as unknown as AppState);

test('a course ending within a week gets one-off reminders that stop on its last day', () => {
  const now = new Date(2026, 9, 24, 10, 0); // Sat 24 Oct, 10:00
  const s = stateOf([med('Augmentin', 'me', '20:00', { endDate: '2026-10-26' }), med('Telma', 'me', '09:00')]);
  const plan = reminderPlan(s, now);
  assert.deepEqual(plan.repeating.map((r) => r.time), ['09:00']); // Telma repeats; Augmentin does not
  const aug = plan.dated.filter((r) => r.lines.some((l) => l.includes('Augmentin')));
  assert.deepEqual(aug.map((r) => r.when.getDate()), [24, 25, 26]); // tonight, Sunday, Monday — none after
});

test('too many repeating reminders: one-off reminders for the coming days instead, never more than the limit', () => {
  const now = new Date(2026, 9, 24, 6, 0);
  // 10 times a day, each with a Mon/Wed/Fri medicine as well as a daily one → 70 weekly slots.
  const meds = Array.from({ length: 10 }, (_, i) => {
    const t = `${String(7 + i).padStart(2, '0')}:00`;
    return [med(`Daily${i}`, 'me', t), med(`MWF${i}`, 'me', t, {}, [1, 3, 5])];
  }).flat();
  const plan = reminderPlan(stateOf(meds), now);
  assert.equal(plan.repeating.length, 0);
  assert.ok(plan.dated.length > 0 && plan.dated.length <= DOSE_REMINDER_MAX);
  assert.ok(plan.dated[0].when.getTime() > now.getTime());
});

test('members in another time zone get no reminders or follow-ups on this phone', () => {
  const now = new Date('2026-10-21T02:50:00Z');
  const s = stateOf([med('Amlong', 'ma', '08:30', { endDate: '2026-10-25' }), med('Thyrox', 'me', '20:00')], [me, ma]);
  const plan = reminderPlan(s, now);
  for (const r of [...plan.repeating, ...plan.dated, ...followUps(s, now, 30)]) assert.ok(r.lines.every((l) => !l.includes('Amlong')), r.lines.join());
});

test('a 23:30 dose is still due at 00:30 the next day', () => {
  const s = stateOf([med('Night', 'me', '23:30')]);
  const due = dueNow(s, new Date(2026, 9, 25, 0, 30), 'me');
  assert.equal(due.length, 1);
  assert.equal(due[0].date, '2026-10-24');
});
