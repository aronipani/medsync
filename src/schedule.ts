import type { AppState, Dose, DoseLog, Medication, Member, Occurrence, Settings } from './types.ts';
import { addDays, atTime, atTimeIn, clockIn, dateKey, dateKeyIn, daysBetween, fmt12, fromMinutes, otherZone, shiftDate, toMinutes } from './time.ts';

export const MEAL_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' } as const;

/** Clock time (HH:MM) of a dose for a given member. */
export function doseTime(dose: Dose, member: Member, settings: Settings): string {
  const t = dose.timing;
  if (t.kind === 'custom') return t.time;
  const base = toMinutes(member.mealTimes[t.meal]);
  const off = t.relation === 'before' ? -settings.mealOffsetMin : t.relation === 'after' ? settings.mealOffsetMin : 0;
  return fromMinutes(base + off);
}

export function describeTiming(dose: Dose): string {
  const t = dose.timing;
  if (t.kind === 'custom') return fmt12(t.time);
  const rel = t.relation === 'with' ? 'With' : t.relation === 'before' ? 'Before' : 'After';
  return `${rel} ${MEAL_LABEL[t.meal].toLowerCase()}`;
}

export function medLabel(med: Pick<Medication, 'name' | 'strength'>): string {
  return med.strength ? `${med.name} ${med.strength}` : med.name;
}

export function qtyLabel(qty: number, unit: string): string {
  const q = qty === 0.5 ? '½' : qty === 0.25 ? '¼' : String(qty);
  // "10 ml", not "10 mls"; "2 tablets", "2 puffs".
  const noPlural = unit === 'ml' || unit.endsWith('s');
  return `${q} ${unit}${qty > 1 && !noPlural ? 's' : ''}`;
}

export const occKey = (date: string, medId: string, doseId: string) => `${date}|${medId}|${doseId}`;

function medActiveOn(med: Medication, date: string): boolean {
  if (!med.active) return false;
  if (dateKey(new Date(med.createdAt)) > date) return false;
  if (med.endDate && date > med.endDate) return false;
  return true;
}

function doseOnDay(dose: Dose, date: string): boolean {
  if (!dose.days.length) return true;
  return dose.days.includes(atTime(date, '12:00').getDay());
}

/** All scheduled doses for one day, with their current status. Sorted by time. */
export function occurrencesForDate(state: AppState, date: string, now: Date, memberId?: string): Occurrence[] {
  const { settings } = state;
  // A member in another time zone has their own "today": the phone's day `date` is that member's same-numbered day
  // relative to now (when it's already Wednesday morning in Kolkata on Tuesday evening in California, Tuesday here
  // shows Kolkata's Wednesday). Their logs are kept under their own dates.
  const near = new Set([shiftDate(date, -1), date, shiftDate(date, 1)]);
  const logsByKey = new Map<string, DoseLog>();
  for (const l of state.logs) if (near.has(l.date)) logsByKey.set(l.key, l);
  const out: Occurrence[] = [];
  for (const med of state.meds) {
    if (memberId && med.memberId !== memberId) continue;
    const member = state.members.find((m) => m.id === med.memberId);
    if (!member) continue;
    const tz = otherZone(member.timeZone) ? member.timeZone : undefined;
    const day = tz ? shiftDate(date, daysBetween(dateKey(now), dateKeyIn(now, tz))) : date;
    if (!medActiveOn(med, day)) continue;
    for (const dose of med.doses) {
      if (!doseOnDay(dose, day)) continue;
      const time = doseTime(dose, member, settings);
      const when = atTimeIn(day, time, tz);
      const key = occKey(day, med.id, dose.id);
      const log = logsByKey.get(key);
      // A dose added/retimed after its slot today doesn't count for today.
      if (!log && new Date(dose.since) > when) continue;
      let status: Occurrence['status'];
      if (log) status = log.status;
      else {
        const diff = (now.getTime() - when.getTime()) / 60000;
        if (diff < -settings.dueWindowMin) status = 'upcoming';
        else if (diff <= settings.missedAfterMin) status = 'due';
        else status = 'missed';
      }
      out.push({ key, date: day, time, memberId: member.id, med, dose, status, log, at: when.getTime(), ...(tz ? { localTime: clockIn(when) } : {}) });
    }
  }
  return out.sort((a, b) => (a.at ?? 0) - (b.at ?? 0) || a.time.localeCompare(b.time) || a.med.name.localeCompare(b.med.name));
}

/** Doses that can be verified by scanning right now (today, inside the window, not yet logged). */
export function dueNow(state: AppState, now: Date, memberId?: string): Occurrence[] {
  // Yesterday and tomorrow too: a 23:30 dose is still due at 00:30, and a 00:15 dose is due at 23:45 (review 24 Oct 2026).
  return [addDays(now, -1), now, addDays(now, 1)]
    .flatMap((d) => occurrencesForDate(state, dateKey(d), now, memberId))
    .filter((o) => o.status === 'due');
}

/** Doses scheduled today for this member but not due now — used to explain a "wrong time" scan. */
export function notDueToday(state: AppState, now: Date, memberId?: string): Occurrence[] {
  return occurrencesForDate(state, dateKey(now), now, memberId).filter((o) => o.status !== 'due');
}

/** New "missed" logs for doses whose window has closed without a log (today and yesterday). */
export function computeMissed(state: AppState, now: Date, makeId: () => string): DoseLog[] {
  const out: DoseLog[] = [];
  for (const d of [addDays(now, -1), now]) {
    for (const o of occurrencesForDate(state, dateKey(d), now)) {
      if (o.log || o.status !== 'missed') continue;
      // Someone in another time zone takes their medicines with their own phone; this phone can't know, so it
      // doesn't mark them missed.
      if (o.localTime) continue;
      out.push({
        id: makeId(),
        key: o.key,
        memberId: o.memberId,
        medId: o.med.id,
        medName: medLabel(o.med),
        date: o.date,
        time: o.time,
        status: 'missed',
        method: 'auto',
        qty: o.dose.qty,
        at: now.toISOString(),
      });
    }
  }
  return out;
}

export interface ReminderSlot {
  time: string; // HH:MM
  weekday?: number; // 0..6 when the slot only applies to certain days
  lines: string[];
}

/**
 * Groups every active dose into one reminder per clock time.
 * Times where some dose is limited to certain weekdays are split into per-weekday reminders.
 */
export function reminderSlots(state: AppState, skipMed: (med: Medication) => boolean = () => false): ReminderSlot[] {
  type Item = { time: string; days: number[]; line: string; member: string };
  const items: Item[] = [];
  const today = dateKey(new Date());
  for (const med of state.meds) {
    if (!med.active || (med.endDate && med.endDate < today) || skipMed(med)) continue;
    const member = state.members.find((m) => m.id === med.memberId);
    if (!member) continue;
    // Reminders for someone in another time zone go off on their own phone, at their time — not on this one.
    if (otherZone(member.timeZone)) continue;
    for (const dose of med.doses) {
      items.push({
        time: doseTime(dose, member, state.settings),
        days: dose.days,
        member: member.name,
        line: `${medLabel(med)} · ${qtyLabel(dose.qty, med.unit)} · ${describeTiming(dose).toLowerCase()}`,
      });
    }
  }
  const byTime = new Map<string, Item[]>();
  for (const it of items) byTime.set(it.time, [...(byTime.get(it.time) ?? []), it]);
  const fmtLines = (list: Item[]) => {
    const multi = new Set(list.map((i) => i.member)).size > 1 || state.members.length > 1;
    return list.map((i) => (multi ? `${i.member}: ${i.line}` : i.line));
  };
  const slots: ReminderSlot[] = [];
  for (const [time, list] of [...byTime.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (list.every((i) => i.days.length === 0)) {
      slots.push({ time, lines: fmtLines(list) });
      continue;
    }
    for (let wd = 0; wd < 7; wd++) {
      const onDay = list.filter((i) => i.days.length === 0 || i.days.includes(wd));
      if (onDay.length) slots.push({ time, weekday: wd, lines: fmtLines(onDay) });
    }
  }
  return slots;
}

// ---------- What to schedule on this phone (review 24 Oct 2026) ----------

/** iOS keeps at most 64 pending reminders; dose reminders get this many, the rest is for checks, buying, follow-ups. */
export const DOSE_REMINDER_MAX = 48;
const DATED_DAYS = 8;

export interface DatedReminder {
  when: Date;
  time: string; // HH:MM on this phone
  lines: string[];
}

export interface ReminderPlan {
  repeating: ReminderSlot[]; // daily or weekly
  dated: DatedReminder[]; // one-off, for the next days
}

/**
 * Dose reminders for this phone:
 *  - repeating daily/weekly reminders for ongoing medicines;
 *  - one-off reminders for medicines whose course ends within a week, so they stop on the last day even if the app
 *    isn't opened again (a daily repeat would keep ringing after the course);
 *  - if the repeating ones would pass DOSE_REMINDER_MAX (many times with weekday-only doses), one-off reminders for
 *    as many coming days as fit instead, refreshed whenever the app opens — rather than iOS silently dropping some.
 * Members in another time zone get none here: their own phone reminds them.
 */
export function reminderPlan(state: AppState, now: Date = new Date()): ReminderPlan {
  const horizon = dateKey(addDays(now, DATED_DAYS - 1));
  const endingSoon = (m: Medication) => !!m.endDate && m.endDate <= horizon;
  let repeating = reminderSlots(state, endingSoon);
  const allDated = repeating.length > DOSE_REMINDER_MAX;
  if (allDated) repeating = [];
  const datedMed = (m: Medication) => allDated || endingSoon(m);
  const multi = state.members.length > 1;
  const byInstant = new Map<number, DatedReminder>();
  for (let d = 0; d < DATED_DAYS; d++) {
    for (const o of occurrencesForDate(state, dateKey(addDays(now, d)), now)) {
      if (!datedMed(o.med) || o.localTime || (o.status !== 'upcoming' && o.status !== 'due') || (o.at ?? 0) <= now.getTime()) continue;
      const member = state.members.find((m) => m.id === o.memberId);
      const line = `${multi && member ? `${member.name}: ` : ''}${medLabel(o.med)} · ${qtyLabel(o.dose.qty, o.med.unit)} · ${describeTiming(o.dose).toLowerCase()}`;
      const r = byInstant.get(o.at!) ?? { when: new Date(o.at!), time: o.time, lines: [] };
      if (!r.lines.includes(line)) r.lines.push(line);
      byInstant.set(o.at!, r);
    }
  }
  const dated = [...byInstant.values()].sort((a, b) => a.when.getTime() - b.when.getTime()).slice(0, Math.max(0, DOSE_REMINDER_MAX - repeating.length));
  return { repeating, dated };
}

/** "Not taken yet" follow-ups for today's and tomorrow's open doses on this phone (not other-time-zone members). */
export function followUps(state: AppState, now: Date, followUpMin: number): DatedReminder[] {
  const out = new Map<number, DatedReminder>();
  const multi = state.members.length > 1;
  for (const day of [now, addDays(now, 1)]) {
    for (const o of occurrencesForDate(state, dateKey(day), now)) {
      if ((o.status !== 'due' && o.status !== 'upcoming') || o.localTime || o.at === undefined) continue;
      const when = o.at + followUpMin * 60000;
      if (when <= now.getTime()) continue;
      const who = multi ? `${state.members.find((m) => m.id === o.memberId)?.name}: ` : '';
      const r = out.get(when) ?? { when: new Date(when), time: o.time, lines: [] };
      r.lines.push(`${who}${o.med.name} ${o.med.strength}`.trim());
      out.set(when, r);
    }
  }
  return [...out.values()].sort((a, b) => a.when.getTime() - b.when.getTime());
}
