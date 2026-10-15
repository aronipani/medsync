// Expiry dates read from strip text. Pure — see docs/specs/05-expiry-dates.md.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const KEYWORD = String.raw`(?:exp(?:iry|\.)?|use\s+before)(?:[\s.:]*(?:date|dt))?[\s.:\-]*`;
const NUMERIC = new RegExp(String.raw`\b${KEYWORD}(\d{1,2})\s*[/.\-]\s*(\d{4}|\d{2})(?!\d)`, 'gi');
const NAMED = new RegExp(String.raw`\b${KEYWORD}(${MONTHS.join('|')})[a-z]*\.?[\s/.\-]*(\d{4}|\d{2})(?!\d)`, 'gi');

/** The expiry printed on a strip as "YYYY-MM", or undefined. The earliest if several are read. */
export function parseExpiry(text: string, now = new Date()): string | undefined {
  const found: string[] = [];
  const add = (month: number, yearText: string) => {
    const year = yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText);
    if (month < 1 || month > 12) return;
    const y = now.getFullYear();
    if (year < y - 3 || year > y + 10) return; // misread
    found.push(`${year}-${String(month).padStart(2, '0')}`);
  };
  for (const m of text.matchAll(NUMERIC)) add(Number(m[1]), m[2]);
  for (const m of text.matchAll(NAMED)) add(MONTHS.indexOf(m[1].toLowerCase().slice(0, 3)) + 1, m[2]);
  return found.sort()[0];
}

export type ExpiryStatus = 'expired' | 'soon' | 'ok';

/** Usable until the end of the printed month; "soon" within 30 days of that. */
export function expiryStatus(ym: string, now = new Date()): ExpiryStatus {
  const [y, m] = ym.split('-').map(Number);
  const end = new Date(y, m, 1).getTime(); // first moment of the next month
  if (now.getTime() >= end) return 'expired';
  return end - now.getTime() <= 30 * 864e5 ? 'soon' : 'ok';
}

/** "2028-03" → "Mar 2028". */
export function formatExpiry(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const name = MONTHS[m - 1] ?? '';
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`;
}
