import type { AppState, Dose, DoseLog, Medication, Member, Occurrence, Settings } from './types.ts';
import { addDays, atTime, dateKey, fmt12, fromMinutes, toMinutes } from './time.ts';

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
  return `${q} ${unit}${qty > 1 && !unit.endsWith('s') ? 's' : ''}`;
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
  const logsByKey = new Map<string, DoseLog>();
  for (const l of state.logs) if (l.date === date) logsByKey.set(l.key, l);
  const out: Occurrence[] = [];
  for (const med of state.meds) {
    if (memberId && med.memberId !== memberId) continue;
    const member = state.members.find((m) => m.id === med.memberId);
    if (!member || !medActiveOn(med, date)) continue;
    for (const dose of med.doses) {
      if (!doseOnDay(dose, date)) continue;
      const time = doseTime(dose, member, settings);
      const when = atTime(date, time);
      const key = occKey(date, med.id, dose.id);
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
      out.push({ key, date, time, memberId: member.id, med, dose, status, log });
    }
  }
  return out.sort((a, b) => a.time.localeCompare(b.time) || a.med.name.localeCompare(b.med.name));
}

/** Doses that can be verified by scanning right now (today, inside the window, not yet logged). */
export function dueNow(state: AppState, now: Date, memberId?: string): Occurrence[] {
  return occurrencesForDate(state, dateKey(now), now, memberId).filter((o) => o.status === 'due');
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
export function reminderSlots(state: AppState): ReminderSlot[] {
  type Item = { time: string; days: number[]; line: string; member: string };
  const items: Item[] = [];
  const today = dateKey(new Date());
  for (const med of state.meds) {
    if (!med.active || (med.endDate && med.endDate < today)) continue;
    const member = state.members.find((m) => m.id === med.memberId);
    if (!member) continue;
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
