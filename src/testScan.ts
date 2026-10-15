// Test scan: try the scanner on a strip before the reminder comes, without logging a dose.
// Pure — no React Native — so it can be unit tested. See docs/specs/11-test-scan.md.

import { matchDetail } from './match.ts';
import { occurrencesForDate } from './schedule.ts';
import { addDays, dateKey } from './time.ts';
import type { AppState, Medication, Occurrence } from './types.ts';

export type TestOutcome =
  | { kind: 'ok'; med: Medication; via?: string; substitute?: boolean }
  | { kind: 'check'; med: Medication } // name read, strength not
  | { kind: 'strength'; med: Medication; found: string[] } // name read, a different strength printed
  | { kind: 'conflict'; med: Medication; looksLike: string } // looks like a different medicine
  | { kind: 'unknown' };

/**
 * What the scanner would make of this strip, checked against every active medicine in the household
 * (not just the ones due now). Same rules as the Scan tab: a clear match wins, then another brand of the
 * same medicine, then a wrong strength, then "looks like something else", then name only.
 */
export function classifyTest(text: string, meds: Medication[]): TestOutcome {
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
