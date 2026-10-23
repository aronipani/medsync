// Keeps one entry per medicine: matches a new prescription against the existing schedule,
// describes what changes, applies it without losing dose history, and merges duplicates.
// Pure — no React Native — so it can be unit tested.

import { lookupBrand, lookupIngredients } from './drugdb.ts';
import type { Dose, DoseLog, Medication } from './types.ts';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
/** "Monotrate 10" -> "monotrate"; "Bempedoic Acid 180 + Ezetimibe 10" -> "bempedoicacid+ezetimibe". */
const nameOnly = (s: string) =>
  s
    .split('+')
    .map((p) => norm(p.replace(/\b\d+(\.\d+)?\s*(mg|mcg|ml|iu|k|g)?\b/gi, '')))
    .filter(Boolean)
    .join('+');

function ingredientsOf(m: Pick<Medication, 'name'>): string | undefined {
  const e = lookupBrand(m.name) ?? lookupIngredients(m.name.split(/\s*\+\s*/))[0];
  return e ? e.ingredients.map(norm).sort().join('+') : undefined;
}

export const strengthKey = (s: string) => s.toLowerCase().replace(/mg/g, '').replace(/\s+/g, '');

/** Same medicine (ignoring strength): same name, a name listed as the other's alias, or the same contents. */
export function sameMedicine(a: Pick<Medication, 'name' | 'aliases'>, b: Pick<Medication, 'name' | 'aliases'>): boolean {
  const an = nameOnly(a.name);
  const bn = nameOnly(b.name);
  if (!an || !bn) return false;
  if (an === bn) return true;
  const aNames = new Set([an, ...a.aliases.map(nameOnly)]);
  const bNames = new Set([bn, ...b.aliases.map(nameOnly)]);
  if (aNames.has(bn) || bNames.has(an)) return true;
  const ai = ingredientsOf(a);
  const bi = ingredientsOf(b);
  return !!ai && ai === bi;
}

const timingKey = (d: Pick<Dose, 'timing' | 'days'>) => JSON.stringify([d.timing, [...d.days].sort()]);

export type Describe = (m: Medication) => string; // e.g. "8:00 AM · 1 tablet; 8:00 PM · 1 tablet"

export interface PlanItem {
  itemId: string;
  action: 'new' | 'update' | 'same';
  targetId?: string;
  targetLabel?: string;
  diffs: string[]; // "Strength 20 → 40", "Times: 8:00 AM → 8:00 AM, 8:00 PM"
}

export interface RxPlan {
  items: PlanItem[];
  missing: Medication[]; // active medicines for this person that the new prescription doesn't mention
}

/** Compares drafts (from a prescription) with the person's current medicines. */
export function planPrescription(existing: Medication[], drafts: { id: string; med: Medication }[], describe: Describe): RxPlan {
  const used = new Set<string>();
  const items: PlanItem[] = drafts.map(({ id, med }) => {
    const candidates = existing.filter((e) => !used.has(e.id) && sameMedicine(e, med));
    const target =
      candidates.find((e) => e.active && strengthKey(e.strength) === strengthKey(med.strength)) ??
      candidates.find((e) => e.active) ??
      candidates[0];
    if (!target) return { itemId: id, action: 'new', diffs: [] };
    used.add(target.id);
    const diffs: string[] = [];
    if (norm(target.name) !== norm(med.name)) diffs.push(`Name ${target.name} → ${med.name}`);
    if (med.strength && strengthKey(target.strength) !== strengthKey(med.strength)) diffs.push(`Strength ${target.strength || '—'} → ${med.strength}`);
    if (med.unit !== target.unit) diffs.push(`Form ${target.unit} → ${med.unit}`);
    const before = describe(target);
    const after = describe(med);
    if (before !== after) diffs.push(`When: ${before || 'no times'} → ${after || 'no times'}`);
    if ((target.endDate ?? '') !== (med.endDate ?? '')) diffs.push(`Until: ${target.endDate ?? 'ongoing'} → ${med.endDate ?? 'ongoing'}`);
    if (!target.active) diffs.push('Was stopped → restarted');
    return {
      itemId: id,
      action: diffs.length ? 'update' : 'same',
      targetId: target.id,
      targetLabel: `${target.name} ${target.strength}`.trim(),
      diffs,
    };
  });
  const missing = existing.filter((e) => e.active && !used.has(e.id));
  return { items, missing };
}

/** New doses keep the id (and history) of an old dose with the same timing, so a dose already taken today isn't due again. */
export function reuseDoseIds(oldDoses: Dose[], newDoses: Dose[], nowIso: string): Dose[] {
  const pool = [...oldDoses];
  return newDoses.map((d) => {
    const i = pool.findIndex((o) => timingKey(o) === timingKey(d));
    if (i < 0) return { ...d, since: nowIso };
    const [o] = pool.splice(i, 1);
    return { ...d, id: o.id, since: o.since };
  });
}

const union = (...lists: string[][]) => {
  const out: string[] = [];
  for (const l of lists) for (const x of l) if (x && !out.some((y) => norm(y) === norm(x))) out.push(x);
  return out;
};

export interface ScheduleChange {
  kind: 'added' | 'changed' | 'stopped' | 'merged' | 'removed' | 'restored' | 'edited';
  medName: string;
  detail?: string;
}

/** Applies an approved prescription to one person's medicines. Returns their new medicine list and a change log. */
export function applyPrescription(
  existing: Medication[],
  drafts: { id: string; med: Medication }[],
  plan: RxPlan,
  stopIds: string[],
  nowIso: string,
  note?: string,
): { meds: Medication[]; changes: ScheduleChange[] } {
  const byId = new Map(existing.map((m) => [m.id, m]));
  const changes: ScheduleChange[] = [];
  const added: Medication[] = [];
  for (const p of plan.items) {
    const draft = drafts.find((d) => d.id === p.itemId)?.med;
    if (!draft) continue;
    const label = `${draft.name} ${draft.strength}`.trim();
    if (p.action === 'new' || !p.targetId) {
      added.push({ ...draft, active: true, createdAt: nowIso, doses: draft.doses.map((d) => ({ ...d, since: nowIso })), notes: [draft.notes, note].filter(Boolean).join(' ') || undefined });
      changes.push({ kind: 'added', medName: label });
      continue;
    }
    const old = byId.get(p.targetId)!;
    if (p.action === 'same') {
      byId.set(old.id, { ...old, active: true });
      continue;
    }
    const renamed = norm(old.name) !== norm(draft.name);
    byId.set(old.id, {
      ...old,
      name: draft.name,
      strength: draft.strength || old.strength,
      unit: draft.unit,
      doses: reuseDoseIds(old.doses, draft.doses, nowIso),
      aliases: union(old.aliases, draft.aliases, renamed ? [`${old.name} ${old.strength}`.trim()] : []),
      barcodes: union(old.barcodes, draft.barcodes),
      endDate: draft.endDate,
      notes: draft.notes ?? old.notes,
      active: true,
    });
    changes.push({ kind: 'changed', medName: label, detail: p.diffs.join('; ') });
  }
  for (const id of stopIds) {
    const m = byId.get(id);
    if (m && m.active) {
      byId.set(id, { ...m, active: false });
      changes.push({ kind: 'stopped', medName: `${m.name} ${m.strength}`.trim(), detail: 'Not on the new prescription' });
    }
  }
  return { meds: [...byId.values(), ...added], changes };
}

/** Groups of the same medicine at the same strength listed more than once (for one person). */
export function duplicateGroups(meds: Medication[]): Medication[][] {
  const groups: Medication[][] = [];
  for (const m of meds) {
    const g = groups.find((x) => sameMedicine(x[0], m) && strengthKey(x[0].strength) === strengthKey(m.strength));
    if (g) g.push(m);
    else groups.push([m]);
  }
  return groups.filter((g) => g.length > 1);
}

/**
 * Merges a duplicate group into its oldest entry: doses combined (same times only once), stock added up,
 * names and barcodes kept. Returns the merged medicine, the removed ids, and a map to move dose logs across.
 */
export function mergeGroup(group: Medication[]): { med: Medication; removed: string[]; remap: Map<string, { medId: string; doseId: string }> } {
  const sorted = [...group].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const keep = sorted[0];
  const doses = [...keep.doses];
  const remap = new Map<string, { medId: string; doseId: string }>();
  let stock = keep.stock;
  const notes = keep.notes ? [keep.notes] : [];
  for (const m of sorted.slice(1)) {
    stock += m.stock;
    if (m.notes && !notes.includes(m.notes)) notes.push(m.notes);
    for (const d of m.doses) {
      const same = doses.find((x) => timingKey(x) === timingKey(d));
      if (same) remap.set(`${m.id}|${d.id}`, { medId: keep.id, doseId: same.id });
      else {
        doses.push(d);
        remap.set(`${m.id}|${d.id}`, { medId: keep.id, doseId: d.id });
      }
    }
  }
  return {
    med: {
      ...keep,
      doses,
      stock: +stock.toFixed(2),
      aliases: union(keep.aliases, ...sorted.slice(1).map((m) => [...m.aliases, m.name !== keep.name ? m.name : ''])),
      barcodes: union(keep.barcodes, ...sorted.slice(1).map((m) => m.barcodes)),
      learned: [...new Set(sorted.flatMap((m) => m.learned ?? []))].slice(-8),
      notes: notes.join(' ') || undefined,
      active: sorted.some((m) => m.active),
      endDate: sorted.some((m) => m.active && !m.endDate) ? undefined : keep.endDate,
    },
    removed: sorted.slice(1).map((m) => m.id),
    remap,
  };
}

/** Moves dose logs of merged-away medicines onto the kept one. If both have a log for the same dose, "taken" wins. */
export function remapLogs(logs: DoseLog[], remap: Map<string, { medId: string; doseId: string }>): DoseLog[] {
  const out = new Map<string, DoseLog>();
  const rank = (l: DoseLog) => (l.status === 'taken' ? 3 : l.status === 'skipped' ? 2 : 1);
  for (const l of logs) {
    const [date, medId, doseId] = l.key.split('|');
    const to = remap.get(`${medId}|${doseId}`);
    const moved = to ? { ...l, medId: to.medId, key: `${date}|${to.medId}|${to.doseId}` } : l;
    const prev = out.get(moved.key);
    if (!prev || rank(moved) > rank(prev)) out.set(moved.key, moved);
  }
  return [...out.values()];
}

/**
 * Two people on this phone with mostly the same medicines are probably one person entered twice ("Me" and "Aroni",
 * or a file opened as a new person). Returns such pairs: at least 2 shared medicines (same name and strength), and
 * at least half of the smaller list. Two people who really take a couple of the same medicines rarely meet both.
 */
export function samePersonTwice(members: { id: string; name: string }[], meds: Medication[]): { a: string; b: string; shared: string[] }[] {
  const out: { a: string; b: string; shared: string[] }[] = [];
  const active = (id: string) => meds.filter((m) => m.memberId === id && m.active);
  for (let i = 0; i < members.length; i++)
    for (let j = i + 1; j < members.length; j++) {
      const A = active(members[i].id);
      const B = active(members[j].id);
      const shared = A.filter((x) => B.some((y) => sameMedicine(x, y) && strengthKey(x.strength) === strengthKey(y.strength)));
      if (shared.length >= 2 && shared.length * 2 >= Math.min(A.length, B.length))
        out.push({ a: members[i].id, b: members[j].id, shared: shared.map((m) => `${m.name} ${m.strength}`.trim()) });
    }
  return out;
}
