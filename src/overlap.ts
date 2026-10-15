// Same-medicine warning: one person's active medicines that share an ingredient (two brands of one drug,
// or a combination tablet repeating a single one). Pure — see docs/specs/02-duplicate-medicine-warning.md.
// Contents come only from the built-in list or ingredient names written on the medicine; unknown = never flagged.

import { ALL_DRUGS, lookupBrand } from './drugdb.ts';
import type { Medication } from './types.ts';

export type OverlapKind = 'same' | 'partial';

export interface Overlap {
  a: Medication;
  b: Medication;
  shared: string[]; // ingredient names, e.g. ["Clopidogrel"]
  kind: OverlapKind; // same contents, or only some shared
  sameStrength: boolean;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const strengthKey = (s: string) => s.toLowerCase().replace(/mg|mcg|ml/g, '').replace(/\s+/g, '');

// Every ingredient name the app knows, longest first (so "Isosorbide Mononitrate" wins over shorter names).
const KNOWN = [...new Set(ALL_DRUGS.flatMap((d) => d.ingredients))].sort((a, b) => b.length - a.length);

/** The ingredients of a medicine, or [] when unknown. */
export function contentsOf(m: Pick<Medication, 'name' | 'aliases'>): string[] {
  const entry = lookupBrand(m.name) ?? m.aliases.map((a) => lookupBrand(a)).find(Boolean);
  if (entry) return entry.ingredients;
  // Generic names written on the medicine: "Clopidogrel Tablets IP", alias "Clopidogrel 75".
  const text = ` ${[m.name, ...m.aliases].join(' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  const found: string[] = [];
  for (const g of KNOWN) {
    const w = ` ${g.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
    if (text.includes(w) && !found.some((f) => norm(f).includes(norm(g)))) found.push(g);
  }
  return found;
}

const sameNameStrength = (a: Medication, b: Medication) => norm(a.name) === norm(b.name) && strengthKey(a.strength) === strengthKey(b.strength);
const confirmed = (a: Medication, b: Medication) => !!a.overlapOk?.includes(b.id) || !!b.overlapOk?.includes(a.id);

/** How two medicines overlap, if they do (ignores who they belong to and whether they're active). */
export function compare(a: Medication, b: Medication): Overlap | undefined {
  const ca = contentsOf(a);
  const cb = contentsOf(b);
  if (!ca.length || !cb.length) return undefined;
  const nb = new Set(cb.map(norm));
  const shared = ca.filter((g) => nb.has(norm(g)));
  if (!shared.length) return undefined;
  const kind: OverlapKind = ca.length === cb.length && shared.length === ca.length ? 'same' : 'partial';
  return { a, b, shared, kind, sameStrength: strengthKey(a.strength) === strengthKey(b.strength) };
}

/** Every unconfirmed overlap among each person's active medicines. */
export function findOverlaps(meds: Medication[]): Overlap[] {
  const active = meds.filter((m) => m.active);
  const out: Overlap[] = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      if (a.memberId !== b.memberId || confirmed(a, b)) continue;
      const o = compare(a, b);
      if (o) out.push(o);
    }
  }
  return out;
}

/** Overlaps a medicine about to be saved would have with the person's other active medicines. */
export function overlapsFor(med: Medication, all: Medication[]): Overlap[] {
  if (!med.active) return [];
  return all
    .filter((m) => m.id !== med.id && m.memberId === med.memberId && m.active && !confirmed(med, m))
    .map((m) => compare(med, m))
    .filter((o): o is Overlap => !!o);
}

const label = (m: Medication) => `${m.name} ${m.strength}`.trim();
const list = (xs: string[]) => xs.map((x) => x.toLowerCase()).join(' and ');

export function overlapMessage(o: Overlap): string {
  const [a, b] = [label(o.a), label(o.b)];
  if (o.kind === 'same' && o.sameStrength) return `${a} and ${b} are the same medicine (${list(o.shared)}). Taking both doubles the dose.`;
  if (o.kind === 'same') return `${a} and ${b} are both ${list(o.shared)}. Check with your doctor that both are meant to be taken.`;
  return `${a} and ${b} both contain ${list(o.shared)}. Check with your doctor that both are meant to be taken.`;
}

/** Records that a doctor confirmed both are meant to be taken (stored on both medicines). */
export function confirmPair(a: Medication, b: Medication): [Medication, Medication] {
  const add = (m: Medication, id: string) => ({ ...m, overlapOk: [...new Set([...(m.overlapOk ?? []), id])] });
  return [add(a, b.id), add(b, a.id)];
}

/**
 * Prescription check: overlaps of each included item with medicines that stay on the schedule
 * (not stopped, not the one this item updates) and with the other included items.
 */
export function prescriptionOverlaps(
  items: { id: string; med: Medication; targetId?: string }[],
  current: Medication[],
  stopIds: string[] = [],
): Map<string, string[]> {
  const replaced = new Set([...stopIds, ...items.map((i) => i.targetId).filter(Boolean)] as string[]);
  const kept = current.filter((m) => m.active && !replaced.has(m.id));
  const out = new Map<string, string[]>();
  items.forEach((it, i) => {
    const msgs: string[] = [];
    for (const m of kept) {
      const target = it.targetId ? current.find((c) => c.id === it.targetId) : undefined;
      const ok = confirmed(it.med, m) || (!!target && confirmed(target, m) && sameNameStrength(target, it.med));
      const o = !ok && compare(it.med, m);
      if (o) msgs.push(overlapMessage(o));
    }
    items.forEach((other, j) => {
      if (j <= i) return;
      const o = compare(it.med, other.med);
      if (o) msgs.push(overlapMessage(o));
    });
    if (msgs.length) out.set(it.id, msgs);
  });
  return out;
}
