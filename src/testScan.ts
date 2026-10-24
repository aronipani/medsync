// Test scan: try the scanner on a strip before the reminder comes, without logging a dose.
// Pure — no React Native — so it can be unit tested. See docs/specs/11-test-scan.md.

import { householdMatch } from './household.ts';
import { matchDetail } from './match.ts';
import { occurrencesForDate } from './schedule.ts';
import { addDays, dateKey } from './time.ts';
import type { AppState, Medication, Occurrence } from './types.ts';

export type TestOutcome =
  | { kind: 'ok'; med: Medication; via?: string; substitute?: boolean }
  | { kind: 'check'; med: Medication; partial?: boolean } // name read, strength not (partial: only part of the name)
  | { kind: 'strength'; med: Medication; found: string[] } // name read, a different strength printed
  | { kind: 'conflict'; med: Medication; looksLike: string } // looks like a different medicine
  | { kind: 'unknown' };

/**
 * What the scanner would make of this strip, checked against every active medicine in the household
 * (not just the ones due now). Same rules as the Scan tab: a clear match wins, then another brand of the
 * same medicine, then a wrong strength, then "looks like something else", then name only.
 */
export function classifyTest(text: string, meds: Medication[], hints: string[] = []): TestOutcome {
  const active = meds.filter((m) => m.active);
  const checked = active.map((med) => ({ med, d: matchDetail(text, med, active) }));
  const first = (level: string) => checked.find((x) => x.d.level === level);
  const match = first('match');
  if (match) return { kind: 'ok', med: match.med, via: match.d.via };
  const sub = first('substitute');
  if (sub) return { kind: 'ok', med: sub.med, via: sub.d.via, substitute: true };
  const other = first('otherStrength');
  if (other) return { kind: 'strength', med: other.med, found: other.d.foundStrengths ?? [] };
  const conflict = first('conflict');
  if (conflict) return { kind: 'conflict', med: conflict.med, looksLike: conflict.d.looksLike ?? 'another medicine' };
  const nameOnly = first('nameOnly');
  if (nameOnly) return { kind: 'check', med: nameOnly.med };
  // Worn or cut strip: the household's own medicines from fragments (spec 15), as on the Scan tab.
  const hh = householdMatch(text, active, hints);
  const hit = (hh.kind === 'sure' || hh.kind === 'likely') && active.find((m) => m.id === hh.medId);
  if (hit) return hh.kind === 'sure' ? { kind: 'ok', med: hit, via: 'part of the name' } : { kind: 'check', med: hit, partial: true };
  return { kind: 'unknown' };
}

/** The last test of one medicine, kept on the phone. */
export interface TestRecord {
  at: string; // ISO time
  result: 'ok' | 'check' | 'failed';
  seconds?: number; // how long the reading took
  reader?: string;
  detector?: string;
}
export type TestRecords = Record<string, TestRecord>; // by medicine id

/** A test result counts for this long; strips change (new batch, new pack design). */
export const TEST_VALID_DAYS = 30;

/** The record to keep for a test outcome; null when the strip matched no medicine (nothing to record against). */
export function recordFor(outcome: TestOutcome, extra: Omit<TestRecord, 'at' | 'result'>, now = new Date()): { medId: string; record: TestRecord } | null {
  if (outcome.kind === 'unknown') return null;
  const result = outcome.kind === 'ok' ? 'ok' : outcome.kind === 'check' ? 'check' : 'failed';
  return { medId: outcome.med.id, record: { at: now.toISOString(), result, ...extra } };
}

export type Readiness = 'ready' | 'check' | 'failed' | 'untested' | 'stale';

export interface UpcomingMed {
  med: Medication;
  memberId: string;
  date: string;
  time: string; // first upcoming dose in the window
  readiness: Readiness;
  last?: TestRecord;
}

/**
 * Medicines with a dose coming up in the next `hours` (default the rest of today and tomorrow morning),
 * each with whether it has been test-scanned recently and how that went. Soonest first.
 */
export function upcomingReadiness(state: AppState, records: TestRecords, now = new Date(), hours = 24, memberId?: string): UpcomingMed[] {
  const until = now.getTime() + hours * 3600e3;
  const occs: Occurrence[] = [];
  for (let d = 0; d <= Math.ceil(hours / 24); d++) {
    const date = dateKey(addDays(now, d));
    for (const o of occurrencesForDate(state, date, now, memberId)) {
      const when = new Date(`${o.date}T${o.time}:00`).getTime();
      if ((o.status === 'upcoming' || o.status === 'due') && when <= until) occs.push(o);
    }
  }
  occs.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const out: UpcomingMed[] = [];
  const seen = new Set<string>();
  for (const o of occs) {
    if (seen.has(o.med.id)) continue;
    seen.add(o.med.id);
    const last = records[o.med.id];
    out.push({ med: o.med, memberId: o.memberId, date: o.date, time: o.time, readiness: readinessOf(last, now), last });
  }
  return out;
}

export function readinessOf(last: TestRecord | undefined, now = new Date()): Readiness {
  if (!last) return 'untested';
  if (now.getTime() - new Date(last.at).getTime() > TEST_VALID_DAYS * 864e5) return 'stale';
  return last.result === 'ok' ? 'ready' : last.result;
}

/** "2 of 3 ready" style summary for the Scan tab. */
export function readinessSummary(list: UpcomingMed[]): { ready: number; total: number } {
  return { ready: list.filter((u) => u.readiness === 'ready').length, total: list.length };
}

const READINESS_TEXT: Record<Exclude<Readiness, 'ready'>, string> = {
  untested: 'not tested yet',
  failed: 'last test failed',
  check: 'strength not read last time',
  stale: 'tested over a month ago',
};

export interface TestReminder {
  when: Date; // when to remind
  date: string;
  time: string; // the dose time it's for
  lines: string[]; // "Ma: Clopilet 75 — not tested yet"
}

/**
 * "Test-scan first" reminders (spec 11): for each dose time in the next `hours`, if any medicine in it hasn't
 * passed a test scan that will still count at dose time, one reminder `leadMin` before it listing those medicines.
 * Doses whose reminder time has already passed are skipped. Soonest first.
 */
export function testReminders(state: AppState, records: TestRecords, now = new Date(), leadMin = 60, hours = 48): TestReminder[] {
  if (!leadMin) return [];
  const multi = state.members.length > 1;
  const slots = new Map<string, TestReminder>();
  for (let d = 0; d <= Math.ceil(hours / 24); d++) {
    const date = dateKey(addDays(now, d));
    for (const o of occurrencesForDate(state, date, now)) {
      // Not for someone in another time zone (their own phone reminds them), and from the dose's real instant.
      if ((o.status !== 'upcoming' && o.status !== 'due') || o.localTime) continue;
      const dose = o.at !== undefined ? new Date(o.at) : new Date(`${o.date}T${o.time}:00`);
      const when = new Date(dose.getTime() - leadMin * 60000);
      if (when <= now || dose.getTime() > now.getTime() + hours * 3600e3) continue;
      const r = readinessOf(records[o.med.id], dose); // a test that will have expired by dose time doesn't count
      if (r === 'ready') continue;
      const key = `${o.date} ${o.time}`;
      const slot = slots.get(key) ?? { when, date: o.date, time: o.time, lines: [] };
      const who = multi ? `${state.members.find((m) => m.id === o.memberId)?.name ?? ''}: ` : '';
      const line = `${who}${`${o.med.name} ${o.med.strength}`.trim()} — ${READINESS_TEXT[r]}`;
      if (!slot.lines.includes(line)) slot.lines.push(line);
      slots.set(key, slot);
    }
  }
  return [...slots.values()].sort((a, b) => a.when.getTime() - b.when.getTime());
}
