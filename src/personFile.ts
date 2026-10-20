// One person's medicines as a file, to send between phones (a parent in India, a caregiver anywhere).
// Pure — no React Native — so it can be tested. See docs/specs/20-share-a-person.md.
//
// Opening it adds or updates only that person: their details and schedule come from the file, doses recorded on
// either phone are kept, and things that belong to this phone (stock count, taught strips, strip photos, expiry) stay.
import { sameMedicine } from './consolidate.ts';
import type { ScheduleChange } from './consolidate.ts';
import type { AppState, DoseLog, Medication, Member } from './types.ts';

export const PERSON_FORMAT = 1;
const LOG_DAYS = 90;

export interface PersonFile {
  app: 'medsync';
  kind: 'person';
  format: number;
  exportedAt: string;
  member: Member; // timeZone is always set: where the person lives
  meds: Medication[];
  logs: DoseLog[];
}

export type PersonParse = { ok: true; file: PersonFile } | { ok: false; error: string };

/** The file for one person. Their time zone is written out (this phone's, when they live with it). */
export function makePersonFile(state: AppState, memberId: string, phoneZone: string, now = new Date()): PersonFile {
  const member = state.members.find((m) => m.id === memberId);
  if (!member) throw new Error('No such family member');
  const since = new Date(now.getTime() - LOG_DAYS * 86_400_000).toISOString().slice(0, 10);
  const meds = state.meds
    .filter((m) => m.memberId === memberId)
    // Strip photos are files on this phone: their paths mean nothing elsewhere.
    .map((m) => (m.profile ? { ...m, profile: { ...m.profile, anchors: [], refs: [] } } : m)) as Medication[];
  return {
    app: 'medsync',
    kind: 'person',
    format: PERSON_FORMAT,
    exportedAt: now.toISOString(),
    member: { ...member, timeZone: member.timeZone ?? phoneZone },
    meds,
    logs: state.logs.filter((l) => l.memberId === memberId && l.date >= since),
  };
}

export function personFileName(f: PersonFile): string {
  return `TakeSure - ${f.member.name.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'person'} ${f.exportedAt.slice(0, 10)}.json`;
}

export function parsePersonFile(text: string): PersonParse {
  let f: Partial<PersonFile> | null;
  try {
    f = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file could not be read.' };
  }
  if (!f || f.app !== 'medsync') return { ok: false, error: 'This is not a TakeSure file.' };
  if ((f as { kind?: string }).kind === 'backup') return { ok: false, error: 'This is a full backup, not one person. Open it from Settings → Backup → Restore.' };
  if (f.kind !== 'person') return { ok: false, error: 'This is not a TakeSure file.' };
  if (typeof f.format !== 'number' || f.format > PERSON_FORMAT) return { ok: false, error: 'This file was made by a newer version of TakeSure. Update the app first.' };
  const m = f.member;
  if (!m || typeof m.id !== 'string' || typeof m.name !== 'string' || !m.mealTimes) return { ok: false, error: 'This file is incomplete.' };
  const meds = (Array.isArray(f.meds) ? f.meds : []).filter((x) => x && typeof x.id === 'string' && typeof x.name === 'string' && Array.isArray(x.doses));
  const logs = (Array.isArray(f.logs) ? f.logs : []).filter((x) => x && typeof x.key === 'string' && typeof x.medId === 'string');
  return { ok: true, file: { app: 'medsync', kind: 'person', format: f.format, exportedAt: String(f.exportedAt ?? ''), member: m, meds, logs } };
}

/** Who on this phone the file is about: the same person (sent before), someone with the same name, or nobody. */
export function findPerson(state: AppState, f: PersonFile): { same?: Member; sameName?: Member } {
  const same = state.members.find((m) => m.id === f.member.id);
  if (same) return { same };
  const n = f.member.name.trim().toLowerCase();
  return { sameName: state.members.find((m) => m.name.trim().toLowerCase() === n) };
}

export interface MergeResult {
  state: AppState;
  memberId: string;
  newPerson: boolean;
  changes: ScheduleChange[];
  logsAdded: number;
}

const label = (m: Pick<Medication, 'name' | 'strength'>) => `${m.name} ${m.strength}`.trim();
const union = (a: string[] = [], b: string[] = []) => [...new Set([...a, ...b])];

/**
 * Applies the file to this phone. `intoMemberId` = update that person (the same one, or the same-named one the
 * person chose); undefined = add as a new person.
 */
export function mergePerson(state: AppState, f: PersonFile, phoneZone: string, intoMemberId?: string): MergeResult {
  const target = intoMemberId ? state.members.find((m) => m.id === intoMemberId) : undefined;
  const memberId = target?.id ?? (state.members.some((m) => m.id === f.member.id) ? `${f.member.id}-${Date.now().toString(36)}` : f.member.id);
  const timeZone = f.member.timeZone && f.member.timeZone !== phoneZone ? f.member.timeZone : undefined;
  const member: Member = {
    ...(target ?? {}),
    ...f.member,
    id: memberId,
    color: target?.color ?? f.member.color,
    timeZone,
  };

  const mine = state.meds.filter((m) => m.memberId === memberId);
  const idMap = new Map<string, string>(); // file med id → this phone's med id
  const changes: ScheduleChange[] = [];
  const used = new Set<string>();
  const nextMine: Medication[] = [];
  for (const fm of f.meds) {
    const local = mine.find((m) => m.id === fm.id && !used.has(m.id)) ?? mine.find((m) => !used.has(m.id) && sameMedicine(m, fm));
    if (local) {
      used.add(local.id);
      idMap.set(fm.id, local.id);
      const merged: Medication = {
        ...fm,
        id: local.id,
        memberId,
        // This phone's own: how many are left here, strips taught and photographed here, the strip in use.
        stock: local.stock,
        learned: union(local.learned, fm.learned),
        profile: local.profile ?? (fm.profile ? { ...fm.profile, anchors: [], refs: [] } : undefined),
        expiry: local.expiry ?? fm.expiry,
        found: local.found ?? fm.found,
        barcodes: union(local.barcodes, fm.barcodes),
        overlapOk: local.overlapOk,
        createdAt: local.createdAt < fm.createdAt ? local.createdAt : fm.createdAt,
      };
      if (JSON.stringify(scheduleOf(local)) !== JSON.stringify(scheduleOf(merged)))
        changes.push({ kind: 'changed', medName: label(merged), detail: 'Changed on the other phone' });
      nextMine.push(merged);
    } else {
      const id = state.meds.some((m) => m.id === fm.id) ? `${fm.id}-${Date.now().toString(36)}` : fm.id;
      idMap.set(fm.id, id);
      nextMine.push({ ...fm, id, memberId, overlapOk: undefined, profile: fm.profile ? { ...fm.profile, anchors: [], refs: [] } : undefined });
      changes.push({ kind: 'added', medName: label(fm) });
    }
  }
  // Medicines this phone has for them that the file doesn't: stopped on the other phone (kept, paused, undoable).
  for (const m of mine) {
    if (used.has(m.id)) continue;
    if (m.active) changes.push({ kind: 'stopped', medName: label(m), detail: 'Not on the other phone' });
    nextMine.push({ ...m, active: false });
  }

  // Doses recorded on either phone are all kept. For the same dose, a person's own record beats an automatic "missed".
  const logs = [...state.logs];
  const byKey = new Map(logs.map((l, i) => [l.key, i]));
  let logsAdded = 0;
  for (const fl of f.logs) {
    const medId = idMap.get(fl.medId);
    if (!medId) continue;
    const [date, , doseId] = fl.key.split('|');
    const l: DoseLog = { ...fl, memberId, medId, key: `${date}|${medId}|${doseId}` };
    const i = byKey.get(l.key);
    if (i === undefined) {
      byKey.set(l.key, logs.push(l) - 1);
      logsAdded++;
    } else if ((logs[i].method === 'auto' && l.method !== 'auto') || (logs[i].method !== 'auto' && l.method !== 'auto' && l.at > logs[i].at)) {
      logs[i] = l;
      logsAdded++;
    }
  }

  const members = state.members.some((m) => m.id === memberId) ? state.members.map((m) => (m.id === memberId ? member : m)) : [...state.members, member];
  return {
    state: { ...state, members, meds: [...state.meds.filter((m) => m.memberId !== memberId), ...nextMine], logs },
    memberId,
    newPerson: !target && !state.members.some((m) => m.id === memberId),
    changes,
    logsAdded,
  };
}

const scheduleOf = (m: Medication) => [m.name, m.strength, m.unit, m.aliases, m.doses.map((d) => [d.timing, d.qty, d.days]), m.endDate ?? '', m.active, m.notes ?? ''];
