// Pure date/time helpers. All times are device-local.

export const pad = (n: number) => String(n).padStart(2, '0');

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function fromMinutes(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function isValidTime(s: string): boolean {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  return !!m && +m[1] < 24 && +m[2] < 60;
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Local Date for a YYYY-MM-DD day at HH:MM. */
export function atTime(date: string, hhmm: string): Date {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(y, mo - 1, d, h, m, 0, 0);
}

export function fmt12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${ap}`;
}

export function fmtDay(date: string, today: string): string {
  if (date === today) return 'Today';
  const d = atTime(date, '12:00');
  if (dateKey(addDays(d, 1)) === today) return 'Yesterday';
  if (dateKey(addDays(d, -1)) === today) return 'Tomorrow';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ---------- Time zones (a family member who lives elsewhere, spec 19) ----------
// Everything above is device-local. A member with a different time zone has their doses at their own clock time;
// these turn that into an instant on this phone.

export function deviceZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Is this zone different from the phone's? (undefined = the phone's own zone) */
export function otherZone(tz: string | undefined): tz is string {
  return !!tz && tz !== deviceZone() && zoneWorks(tz);
}

const works = new Map<string, boolean>();
/** Can this phone work out times in that zone? If not, the member is shown on this phone's clock (no crash). */
function zoneWorks(tz: string): boolean {
  let ok = works.get(tz);
  if (ok === undefined) {
    try {
      parts(new Date(), tz);
      ok = true;
    } catch {
      ok = false;
    }
    works.set(tz, ok);
  }
  return ok;
}

function parts(at: Date, tz: string): { y: number; mo: number; d: number; h: number; mi: number } {
  const opts = { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } as const;
  const f = new Intl.DateTimeFormat('en-US', opts);
  // formatToParts isn't in every JavaScript engine (older Hermes on iPhone); "10/21/2026, 08:30" is read instead.
  if (typeof f.formatToParts === 'function') {
    const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
    return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute };
  }
  const m = /(\d{1,2})\D+(\d{1,2})\D+(\d{4})\D+(\d{1,2})\D+(\d{2})/.exec(f.format(at));
  if (!m) throw new Error(`Can't read the time in ${tz}`);
  return { y: +m[3], mo: +m[1], d: +m[2], h: +m[4] % 24, mi: +m[5] };
}

/** Minutes the zone is ahead of UTC at that moment (330 for Kolkata, -420 for Los Angeles in summer). */
export function zoneOffsetMin(tz: string, at: Date): number {
  const p = parts(at, tz);
  return Math.round((Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - Math.floor(at.getTime() / 60000) * 60000) / 60000);
}

/** The instant of YYYY-MM-DD HH:MM on the clock of `tz` (the phone's clock when tz is undefined or the same). */
export function atTimeIn(date: string, hhmm: string, tz?: string): Date {
  if (!otherZone(tz)) return atTime(date, hhmm);
  const [y, mo, d] = date.split('-').map(Number);
  const [h, m] = hhmm.split(':').map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, m);
  let t = wall - zoneOffsetMin(tz, new Date(wall)) * 60000;
  t = wall - zoneOffsetMin(tz, new Date(t)) * 60000; // again, in case a clock change falls in between
  return new Date(t);
}

/** The day (YYYY-MM-DD) and clock time (HH:MM) of an instant in `tz`. */
export function dateKeyIn(at: Date, tz?: string): string {
  if (!otherZone(tz)) return dateKey(at);
  const p = parts(at, tz);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}`;
}
export function clockIn(at: Date, tz?: string): string {
  if (!otherZone(tz)) return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  const p = parts(at, tz);
  return `${pad(p.h)}:${pad(p.mi)}`;
}

/** YYYY-MM-DD shifted by whole days. */
export function shiftDate(date: string, days: number): string {
  return days ? dateKey(addDays(atTime(date, '12:00'), days)) : date;
}

/** Whole days between two YYYY-MM-DD dates (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((atTime(b, '12:00').getTime() - atTime(a, '12:00').getTime()) / 86_400_000);
}

/** Common places for family members, shown first in the picker. */
export const COMMON_ZONES: { tz: string; label: string }[] = [
  { tz: 'Asia/Kolkata', label: 'India' },
  { tz: 'America/New_York', label: 'US Eastern (New York)' },
  { tz: 'America/Chicago', label: 'US Central (Chicago)' },
  { tz: 'America/Denver', label: 'US Mountain (Denver)' },
  { tz: 'America/Phoenix', label: 'US Arizona (Phoenix)' },
  { tz: 'America/Los_Angeles', label: 'US Pacific (Los Angeles)' },
  { tz: 'Asia/Dhaka', label: 'Bangladesh' },
  { tz: 'Asia/Kathmandu', label: 'Nepal' },
  { tz: 'Asia/Dubai', label: 'UAE' },
  { tz: 'Europe/London', label: 'UK' },
  { tz: 'America/Toronto', label: 'Canada Eastern (Toronto)' },
  { tz: 'America/Vancouver', label: 'Canada Pacific (Vancouver)' },
  { tz: 'Asia/Singapore', label: 'Singapore' },
  { tz: 'Australia/Sydney', label: 'Australia (Sydney)' },
];
export const zoneLabel = (tz: string) => COMMON_ZONES.find((z) => z.tz === tz)?.label ?? tz.replace(/_/g, ' ');
