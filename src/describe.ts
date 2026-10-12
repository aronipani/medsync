import { describeTiming, doseTime, qtyLabel } from './schedule.ts';
import { fmt12, DAY_LABELS } from './time.ts';
import type { Medication, Member, Settings } from './types.ts';

/** "8:00 AM ½ tablet (before breakfast); 2:00 PM 1 tablet" — sorted by time. Used in change logs. */
export function describeMedTimes(m: Medication, member: Member, settings: Settings): string {
  return m.doses
    .map((d) => ({ t: doseTime(d, member, settings), d }))
    .sort((a, b) => a.t.localeCompare(b.t))
    .map(({ t, d }) => {
      const days = d.days.length ? ` ${d.days.map((x) => DAY_LABELS[x]).join('/')}` : '';
      const meal = d.timing.kind === 'meal' ? ` (${describeTiming(d).toLowerCase()})` : '';
      return `${fmt12(t)} ${qtyLabel(d.qty, m.unit)}${meal}${days}`;
    })
    .join('; ');
}
