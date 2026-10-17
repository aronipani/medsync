// Finding the medicine when it runs out (spec 17, part B): what to buy, how to ask for it, who had it last time.
// Pure, no I/O. Everything stays on the phone; the message is sent by the person from their own phone.

import { lookupBrand } from './drugdb.ts';
import { addDays, dateKey } from './time.ts';
import { exchangeable, genericLine, ingredientsOf, splitName } from './substitute.ts';
import type { AppState, FoundAnswer, FoundRecord, Medication, Pharmacy } from './types.ts';

/** Units taken per day on average (weekday-only doses count for their share of the week). */
export const perDay = (m: Pick<Medication, 'doses'>) => m.doses.reduce((a, d) => a + d.qty * (d.days.length ? d.days.length / 7 : 1), 0);

/** Whole days the stock lasts, or undefined when nothing is taken regularly. */
export function daysLeft(m: Medication): number | undefined {
  const pd = perDay(m);
  return pd ? Math.max(0, Math.floor(m.stock / pd)) : undefined;
}

const HARD_WINDOW_DAYS = 75; // answers this recent count for "hard to find" (about two refills)

/** Hard to find: last time, two or more pharmacies didn't have it, or it had to be ordered. */
export function hardToFind(m: Medication, now: Date): boolean {
  const since = now.getTime() - HARD_WINDOW_DAYS * 864e5;
  const recent = (m.found ?? []).filter((f) => new Date(f.at).getTime() >= since);
  if (recent.some((f) => f.answer === 'order')) return true;
  return new Set(recent.filter((f) => f.answer === 'no').map((f) => f.pharmacyId)).size >= 2;
}

/** How many days before running out the "Time to buy" reminder comes. */
export const leadDays = (m: Medication, now: Date) => m.buyLeadDays ?? (hardToFind(m, now) ? 14 : 7);

export interface BuyItem {
  med: Medication;
  daysLeft?: number;
  qty: number; // units for about 30 days
  ask: string; // what to ask for: "Clopidogrel 75 mg tablet" (or the name, when the contents are unknown)
  brands: string[]; // brands the household already confirmed as the same medicine, usual first
  only: boolean; // ask for the usual brand only (a change of maker needs the doctor)
  hard: boolean;
  lastHad?: FoundRecord; // the newest "has it"
  ordered?: FoundRecord; // an order still to collect
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const UNIT_WORD: Record<string, string> = { tablet: 'tablet', capsule: 'capsule', sachet: 'sachet', puff: 'inhaler', injection: 'injection' };

/** Builds the buy-list line for one medicine. */
export function buyItem(m: Medication, now: Date, days = 30): BuyItem {
  const usual = { name: m.name, strength: m.strength, aliases: m.aliases, unit: m.unit };
  const ingredients = ingredientsOf(usual);
  const unitWord = UNIT_WORD[m.unit] ?? '';
  const ask = ingredients.length
    ? `${cap(genericLine(ingredients, m.strength))}${unitWord ? ` ${unitWord}` : ''}`
    : `${m.name} ${m.strength}`.trim();
  // Other names that are brands of exactly this medicine (a person confirmed them at the scan, or typed them).
  const others = m.aliases.filter((a) => {
    const { brand, strength } = splitName(a);
    if (!lookupBrand(brand)) return false;
    return exchangeable(usual, { name: brand, strength: strength || m.strength, unit: m.unit }).ok;
  });
  const label = `${m.name} ${m.strength}`.trim();
  const brands = [label, ...others.filter((o) => o.toLowerCase() !== label.toLowerCase())];
  const only = ingredients.length > 0 && exchangeable(usual, usual).askBeforeSwap;
  const pd = perDay(m);
  const qty = m.unit === 'ml' ? Math.ceil((pd * days) / 10) * 10 : Math.ceil(pd * days);
  const found = m.found ?? [];
  const lastHad = [...found].reverse().find((f) => f.answer === 'has');
  const latest = found[found.length - 1];
  const ordered = latest?.answer === 'order' && latest.readyOn && latest.readyOn >= dateKey(addDays(now, -3)) ? latest : undefined;
  return { med: m, daysLeft: daysLeft(m), qty: Math.max(qty, 1), ask, brands, only, hard: hardToFind(m, now), lastHad, ordered };
}

/** Does this medicine need buying now? */
export function needsBuying(m: Medication, now: Date): boolean {
  if (!m.active) return false;
  const left = daysLeft(m);
  if (left === undefined) return m.stock <= m.lowStockAt && m.stock >= 0 && m.lowStockAt > 0;
  // A course that ends before the stock runs out needs nothing more.
  if (m.endDate && m.endDate <= dateKey(addDays(now, left))) return false;
  return left <= leadDays(m, now) || m.stock <= m.lowStockAt;
}

/** Everything to buy, soonest to run out first. `memberId` limits it to one person. */
export function buyList(state: AppState, now: Date, memberId?: string): BuyItem[] {
  return state.meds
    .filter((m) => (!memberId || m.memberId === memberId) && needsBuying(m, now))
    .map((m) => buyItem(m, now))
    .sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999));
}

/** One line per item, the way a pharmacist searches: contents first, brands that are fine, how many. */
export function itemLine(i: BuyItem): string {
  const brands = i.only ? ` (${i.brands[0]} only)` : i.brands.length ? ` (${i.brands.join(' / ')} ${i.brands.length > 1 ? 'are' : 'is'} fine)` : '';
  const qty = i.med.unit === 'ml' ? `${i.qty} ml` : String(i.qty);
  return `${i.ask} × ${qty}${brands}`;
}

/** The message to send a pharmacy (the person presses Send in WhatsApp or Messages). */
export function pharmacyMessage(items: BuyItem[]): string {
  return [
    'Namaste, do you have these medicines?',
    ...items.map((i) => `• ${itemLine(i)}`),
    'Please tell me the price, and if you can deliver. Thank you.',
  ].join('\n');
}

/** Pharmacies in the order to try: those that had these medicines most recently first. */
export function pharmacyOrder(pharmacies: Pharmacy[], items: BuyItem[]): Pharmacy[] {
  const lastHad = new Map<string, string>();
  for (const i of items) for (const f of i.med.found ?? []) {
    if (f.answer === 'has' && f.at > (lastHad.get(f.pharmacyId) ?? '')) lastHad.set(f.pharmacyId, f.at);
  }
  return [...pharmacies].sort((a, b) => (lastHad.get(b.id) ?? '').localeCompare(lastHad.get(a.id) ?? ''));
}

/** Digits to dial: keeps a leading +, drops spaces and dashes. */
export const dialable = (phone: string) => phone.trim().replace(/(?!^\+)[^\d]/g, '');

/** wa.me number: international digits, no +. A 10-digit Indian mobile gets 91 in front. */
export function whatsappNumber(phone: string): string {
  const d = dialable(phone).replace(/^\+/, '');
  if (/^0\d{10}$/.test(d)) return `91${d.slice(1)}`;
  return /^\d{10}$/.test(d) ? `91${d}` : d;
}

export const whatsappLink = (phone: string, text: string) => `https://wa.me/${whatsappNumber(phone)}?text=${encodeURIComponent(text)}`;
export const smsLink = (phone: string, text: string, ios: boolean) => `sms:${dialable(phone)}${ios ? '&' : '?'}body=${encodeURIComponent(text)}`;

/** Adds one answer to a medicine's record (newest last, at most 8 kept). */
export function withAnswer(m: Medication, pharmacyId: string, answer: FoundAnswer, at: Date, readyOn?: string): Medication {
  const rec: FoundRecord = { pharmacyId, answer, at: at.toISOString(), ...(answer === 'order' && readyOn ? { readyOn } : {}) };
  return { ...m, found: [...(m.found ?? []), rec].slice(-8) };
}

/** "Had it on 3 Oct" etc. for the buy list. */
export function answerText(f: FoundRecord, pharmacies: Pharmacy[]): string {
  const name = pharmacies.find((p) => p.id === f.pharmacyId)?.name ?? 'A pharmacy';
  const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  if (f.answer === 'has') return `${name} had it on ${day(f.at)}`;
  if (f.answer === 'order') return `${name} is getting it${f.readyOn ? ` — ready ${day(f.readyOn)}` : ''}`;
  return `${name} didn't have it (${day(f.at)})`;
}

/** Orders to collect, for "Pick up … today" reminders: one per pharmacy and day. */
export function pickups(state: AppState, now: Date): { pharmacy: Pharmacy; date: string; meds: Medication[] }[] {
  const today = dateKey(now);
  const out = new Map<string, { pharmacy: Pharmacy; date: string; meds: Medication[] }>();
  for (const m of state.meds) {
    if (!needsBuying(m, now)) continue; // bought somewhere else meanwhile
    const last = m.found?.[m.found.length - 1];
    if (last?.answer !== 'order' || !last.readyOn || last.readyOn < today) continue;
    const pharmacy = state.pharmacies?.find((p) => p.id === last.pharmacyId);
    if (!pharmacy) continue;
    const k = `${pharmacy.id}|${last.readyOn}`;
    const e = out.get(k) ?? { pharmacy, date: last.readyOn, meds: [] };
    e.meds.push(m);
    out.set(k, e);
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
}
