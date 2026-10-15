import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageText, backupOverdue, makeBackup, parseBackup } from '../src/backup.ts';
import type { AppState, Medication, Settings } from '../src/types.ts';

const DEFAULTS: Settings = { mealOffsetMin: 30, dueWindowMin: 60, missedAfterMin: 120, followUpMin: 30, snoozeMin: 10 };

const med = (id: string, memberId: string, name: string): Medication => ({
  id, memberId, name, strength: '10', aliases: [], barcodes: [], unit: 'tablet', stock: 10, lowStockAt: 5, active: true,
  createdAt: '2026-10-01T00:00:00.000Z', learned: ['abc'],
  doses: [{ id: 'd1', timing: { kind: 'meal', meal: 'breakfast', relation: 'after' }, qty: 1, days: [], since: '2026-10-01T00:00:00.000Z' }],
});

const STATE: AppState = {
  version: 1,
  members: [{ id: 'm1', name: 'Ma', color: '#0F766E', mealTimes: { breakfast: '08:30', lunch: '13:30', dinner: '20:30' }, language: 'bn' }],
  meds: [med('a', 'm1', 'Monotrate'), med('b', 'm1', 'Clopilet')],
  logs: [{ id: 'l1', key: 'k', memberId: 'm1', medId: 'a', medName: 'Monotrate', date: '2026-10-14', time: '09:00', status: 'taken', method: 'text', qty: 1, at: '2026-10-14T09:05:00.000Z' }],
  stock: [],
  settings: { ...DEFAULTS, collectTraining: true },
  history: [],
  pending: { id: 'p', memberId: 'm1', imageUris: ['file:///private/rx-photo.jpg'], createdAt: '2026-10-14T00:00:00.000Z', items: [] },
};

test('backup round trip keeps everything except photos and a pending prescription', () => {
  const file = makeBackup(STATE, new Date('2026-10-15T09:30:00Z'));
  const text = JSON.stringify(file);
  assert.ok(!text.includes('rx-photo.jpg'), 'prescription photos stay out of the file');
  const r = parseBackup(text, DEFAULTS);
  assert.ok(r.ok);
  if (!r.ok) return;
  const { pending: _p, ...expected } = STATE;
  assert.deepEqual(r.state, expected);
  assert.deepEqual(r.summary, { members: 1, medicines: 2, logs: 1 });
  assert.equal(r.exportedAt, '2026-10-15T09:30:00.000Z');
  assert.equal(r.droppedMeds, 0);
});

test('rejects files that are not MedSync backups or are from a newer app', () => {
  const bad = (t: string) => {
    const r = parseBackup(t, DEFAULTS);
    assert.ok(!r.ok);
    return r.ok ? '' : r.error;
  };
  assert.match(bad('not json at all'), /not a MedSync backup/);
  assert.match(bad('{"hello":1}'), /not a MedSync backup/);
  assert.match(bad(JSON.stringify({ ...makeBackup(STATE), kind: 'training' })), /not a MedSync backup/);
  assert.match(bad(JSON.stringify({ ...makeBackup(STATE), format: 99 })), /newer version/);
  assert.match(bad(JSON.stringify({ ...makeBackup(STATE), state: { ...STATE, members: [] } })), /incomplete/);
});

test('repairs missing parts and drops medicines of people not in the file', () => {
  const file = makeBackup(STATE) as any;
  file.state.settings = { snoozeMin: 15 };
  delete file.state.logs;
  delete file.state.history;
  file.state.meds.push(med('c', 'ghost', 'Orphan'));
  const r = parseBackup(JSON.stringify(file), DEFAULTS);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.state.settings.snoozeMin, 15);
  assert.equal(r.state.settings.missedAfterMin, 120);
  assert.deepEqual(r.state.logs, []);
  assert.deepEqual(r.state.history, []);
  assert.equal(r.state.meds.length, 2);
  assert.equal(r.droppedMeds, 1);
});

test('backup age text and the 30-day reminder', () => {
  const now = new Date(2026, 9, 15, 10);
  assert.equal(ageText(undefined, now), 'never');
  assert.equal(ageText(new Date(2026, 9, 15, 8).toISOString(), now), 'today');
  assert.equal(ageText(new Date(2026, 9, 14, 23).toISOString(), now), 'yesterday');
  assert.equal(ageText(new Date(2026, 9, 3).toISOString(), now), '12 days ago');
  assert.equal(backupOverdue({ ...STATE, meds: [] }, now), false, 'nothing to save yet');
  assert.equal(backupOverdue(STATE, now), true, 'never backed up');
  assert.equal(backupOverdue({ ...STATE, settings: { ...STATE.settings, lastBackupAt: new Date(2026, 9, 1).toISOString() } }, now), false);
  assert.equal(backupOverdue({ ...STATE, settings: { ...STATE.settings, lastBackupAt: new Date(2026, 8, 1).toISOString() } }, now), true);
});
