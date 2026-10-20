// Spec 19: a family member in another time zone (parent in Kolkata, caregiver's phone in California).
// Run with the phone in Los Angeles: TZ is set before anything reads the clock.
process.env.TZ = 'America/Los_Angeles';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('instants and clock times in another zone', async () => {
  const { atTimeIn, clockIn, dateKeyIn, zoneOffsetMin } = await import('../src/time.ts');
  assert.equal(zoneOffsetMin('Asia/Kolkata', new Date('2026-10-20T00:00:00Z')), 330);
  // 8:30 AM Wednesday in Kolkata = 03:00 UTC Wednesday = 8:00 PM Tuesday in Los Angeles (PDT).
  const at = atTimeIn('2026-10-21', '08:30', 'Asia/Kolkata');
  assert.equal(at.toISOString(), '2026-10-21T03:00:00.000Z');
  assert.equal(clockIn(at), '20:00');
  assert.equal(dateKeyIn(at, 'Asia/Kolkata'), '2026-10-21');
  // Across the US clock change (1 Nov 2026), Kolkata 8:30 AM moves to 7:00 PM in Los Angeles.
  assert.equal(clockIn(atTimeIn('2026-11-02', '08:30', 'Asia/Kolkata')), '19:00');
});

test("a parent in Kolkata: doses at their time, shown with this phone's time; no reminders or 'missed' here", async () => {
  const { occurrencesForDate, computeMissed, reminderSlots } = await import('../src/schedule.ts');
  const { DEFAULT_SETTINGS } = await import('../src/store.tsx').catch(() => ({ DEFAULT_SETTINGS: undefined }));
  const settings = DEFAULT_SETTINGS ?? { mealOffsetMin: 0, dueWindowMin: 30, missedAfterMin: 120, followUpMin: 0, testReminderMin: 0, snoozeMin: 10 };
  const ma = { id: 'ma', name: 'Ma', color: '#000', mealTimes: { breakfast: '08:30', lunch: '13:30', dinner: '20:30' }, timeZone: 'Asia/Kolkata' };
  const me = { id: 'me', name: 'Me', color: '#111', mealTimes: { breakfast: '08:00', lunch: '12:30', dinner: '19:00' } };
  const dose = { id: 'd1', timing: { kind: 'custom', time: '08:30' }, qty: 1, days: [], since: '2026-01-01T00:00:00Z' };
  const med = (id: string, memberId: string) => ({ id, memberId, name: id, strength: '5', aliases: [], barcodes: [], unit: 'tablet', doses: [dose], stock: 10, lowStockAt: 2, active: true, createdAt: '2026-01-01T00:00:00Z' });
  const state = { members: [me, ma], meds: [med('Amlong', 'ma'), med('Thyrox', 'me')], logs: [], settings, stock: [] } as never;
  // Tuesday 7:50 PM in Los Angeles = Wednesday 8:20 AM in Kolkata.
  const now = new Date('2026-10-21T02:50:00Z');
  const occs = occurrencesForDate(state, '2026-10-20', now);
  const maDose = occs.find((o) => o.memberId === 'ma')!;
  assert.equal(maDose.date, '2026-10-21'); // Ma's Wednesday
  assert.equal(maDose.time, '08:30');
  assert.equal(maDose.localTime, '20:00');
  assert.equal(maDose.status, 'due'); // 10 minutes before her 8:30
  assert.equal(occs.find((o) => o.memberId === 'me')!.localTime, undefined);
  // Hours later: this phone doesn't mark Ma's dose missed (her own phone records it), and sets no reminders for her.
  const later = new Date('2026-10-21T09:00:00Z');
  assert.ok(computeMissed(state, later, () => 'x').every((l) => l.memberId !== 'ma'));
  assert.ok(reminderSlots(state).every((r) => r.lines.every((l) => !l.startsWith('Ma:'))));
});
