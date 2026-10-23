import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState as RNAppState } from 'react-native';
import { computeMissed, medLabel } from './schedule.ts';
import { applyPrescription, duplicateGroups, mergeGroup, planPrescription, remapLogs, type ScheduleChange } from './consolidate.ts';
import { describeMedTimes } from './describe.ts';
import { addLearned, fingerprint } from './learn.ts';
import { confirmPair } from './overlap.ts';
import type { AppState, DoseLog, FoundAnswer, LogMethod, LogStatus, Medication, Member, Occurrence, PendingRx, PendingRxItem, Pharmacy, ScheduleVersion, Settings, StripProfile } from './types.ts';
import { withAnswer } from './buylist.ts';
import { mergePerson, type MergeResult, type PersonFile } from './personFile.ts';
import { deviceZone } from './time.ts';

const KEY = 'medsync:v1';

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const MEMBER_COLORS = ['#0F766E', '#7C3AED', '#C2410C', '#0369A1', '#BE185D', '#4D7C0F'];

export const DEFAULT_SETTINGS: Settings = {
  mealOffsetMin: 30,
  dueWindowMin: 60,
  missedAfterMin: 120,
  followUpMin: 30,
  snoozeMin: 10,
  testReminderMin: 60,
};

export function newMember(name: string, index: number): Member {
  return {
    id: uid(),
    name,
    color: MEMBER_COLORS[index % MEMBER_COLORS.length],
    mealTimes: { breakfast: '08:30', lunch: '13:30', dinner: '20:30' },
  };
}

/** The person every phone starts with. Someone adding themselves by name is usually this person (spec 21 follow-up). */
export const STARTER_NAME = 'Me';
export const starterPerson = (members: Member[]) => members.find((m) => m.name.trim().toLowerCase() === STARTER_NAME.toLowerCase());

const initialState = (): AppState => ({
  version: 1,
  members: [newMember('Me', 0)],
  meds: [],
  logs: [],
  stock: [],
  settings: DEFAULT_SETTINGS,
});

const LOG_RETENTION_DAYS = 365;
const HISTORY_LIMIT = 80;

/** Saves the person's medicines as they are now, then returns state with the version appended. */
function withVersion(s: AppState, memberId: string, reason: string, changes: ScheduleChange[], source?: string): AppState {
  if (!changes.length) return s;
  const v: ScheduleVersion = {
    id: uid(),
    memberId,
    at: new Date().toISOString(),
    reason,
    source,
    before: JSON.parse(JSON.stringify(s.meds.filter((m) => m.memberId === memberId))),
    changes,
  };
  return { ...s, history: [...(s.history ?? []), v].slice(-HISTORY_LIMIT) };
}

const label = (m: Medication) => `${m.name} ${m.strength}`.trim();

interface Store {
  state: AppState;
  ready: boolean;
  now: Date;
  saveMember(m: Member): void;
  deleteMember(id: string): void;
  saveMed(m: Medication): void;
  deleteMed(id: string): void;
  record(occs: Occurrence[], status: LogStatus, method: LogMethod): void;
  undo(key: string): void;
  adjustStock(medId: string, delta: number, reason: 'refill' | 'adjust'): void;
  linkBarcode(medId: string, code: string): void;
  /** Adds a name the scanner accepts for this medicine (another brand the pharmacy gave, spec 17). */
  addOtherName(medId: string, name: string): void;
  /** My pharmacies (spec 17). */
  savePharmacies(list: Pharmacy[]): void;
  /** What a pharmacy said about these medicines: has it, doesn't, or will order (ready on a date). */
  recordAnswer(medIds: string[], pharmacyId: string, answer: FoundAnswer, readyOn?: string): void;
  saveSettings(s: Settings): void;
  replaceAll(s: AppState): void;
  setPending(p: PendingRx | undefined): void;
  updatePendingItem(id: string, patch: Partial<PendingRxItem>): void;
  /** Applies the checked prescription items to the schedule (updating, not duplicating). Returns a summary. */
  approvePending(): { added: number; changed: number; stopped: number };
  /** One person entered twice (e.g. "Me" and "Aroni"): moves everything of `fromId` to `intoId`, merges repeats, removes `fromId`. */
  mergeMembers(fromId: string, intoId: string): void;
  /** Merges medicines that are listed twice for a person. Returns how many entries were removed. */
  mergeDuplicates(memberId: string): number;
  /** Puts a person's schedule back to how it was before a saved change (saving the current one first). */
  restoreVersion(versionId: string): void;
  /** Remembers what was read from a strip a person confirmed is this medicine. */
  teach(medId: string, lines: string[]): void;
  forgetLearned(medId: string): void;
  /** Records that a doctor confirmed two medicines with the same ingredient are both meant to be taken. */
  confirmOverlap(aId: string, bId: string): void;
  /** The expiry (YYYY-MM) of the strip in use; undefined clears it. */
  setExpiry(medId: string, ym: string | undefined): void;
  /** The medicine's strip profile (spec 15); undefined clears it. */
  setProfile(medId: string, profile: StripProfile | undefined): void;
  /** Adds or updates one person from a file another phone sent (spec 20); the schedule before is kept as a version. */
  importPerson(file: PersonFile, intoMemberId?: string): MergeResult;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(initialState);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const loaded = useRef(false);

  // Load once.
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw) as AppState;
          setState({ ...initialState(), ...parsed, settings: { ...DEFAULT_SETTINGS, ...parsed.settings } });
        }
      })
      .catch(() => {})
      .finally(() => {
        loaded.current = true;
        setReady(true);
      });
  }, []);

  // Persist on change.
  useEffect(() => {
    if (loaded.current) AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
  }, [state]);

  // Clock tick + missed-dose sweep every 30s and whenever the app returns to foreground.
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = setInterval(tick, 30_000);
    const sub = RNAppState.addEventListener('change', (s) => s === 'active' && tick());
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    setState((s) => {
      const missed = computeMissed(s, now, uid);
      if (!missed.length) return s;
      const cutoff = new Date(now.getTime() - LOG_RETENTION_DAYS * 864e5).toISOString();
      return { ...s, logs: [...s.logs.filter((l) => l.at >= cutoff), ...missed] };
    });
  }, [now, ready]);

  const update = useCallback((fn: (s: AppState) => AppState) => setState(fn), []);

  const store = useMemo<Store>(
    () => ({
      state,
      ready,
      now,
      saveMember: (m) =>
        update((s) => ({
          ...s,
          members: s.members.some((x) => x.id === m.id) ? s.members.map((x) => (x.id === m.id ? m : x)) : [...s.members, m],
        })),
      deleteMember: (id) =>
        update((s) => ({
          ...s,
          members: s.members.filter((m) => m.id !== id),
          meds: s.meds.filter((m) => m.memberId !== id),
        })),
      saveMed: (m) =>
        update((s) => {
          const old = s.meds.find((x) => x.id === m.id);
          const changes: ScheduleChange[] = [];
          if (!old) changes.push({ kind: 'added', medName: label(m) });
          else {
            const d: string[] = [];
            if (old.name !== m.name) d.push(`Name ${old.name} → ${m.name}`);
            if (old.strength !== m.strength) d.push(`Strength ${old.strength || '—'} → ${m.strength}`);
            const member = s.members.find((x) => x.id === m.memberId);
            const before = member ? describeMedTimes(old, member, s.settings) : '';
            const after = member ? describeMedTimes(m, member, s.settings) : '';
            if (before !== after) d.push(`When: ${before || 'no times'} → ${after || 'no times'}`);
            if (old.active !== m.active) d.push(m.active ? 'Restarted' : 'Paused');
            if ((old.endDate ?? '') !== (m.endDate ?? '')) d.push(`Until: ${old.endDate ?? 'ongoing'} → ${m.endDate ?? 'ongoing'}`);
            if (d.length) changes.push({ kind: 'edited', medName: label(m), detail: d.join('; ') });
          }
          // A new name or strength may be a different medicine: earlier "doctor confirmed" pairs no longer apply,
          // on either side of the pair.
          const renamed = !!old && (old.name !== m.name || old.strength !== m.strength);
          if (renamed && m.overlapOk?.length) m = { ...m, overlapOk: undefined };
          const next = withVersion(s, m.memberId, old ? 'Edited by hand' : 'Added by hand', changes);
          const meds = old ? next.meds.map((x) => (x.id === m.id ? m : x)) : [...next.meds, m];
          return { ...next, meds: renamed ? meds.map((x) => (x.overlapOk?.includes(m.id) ? { ...x, overlapOk: x.overlapOk.filter((o) => o !== m.id) } : x)) : meds };
        }),
      deleteMed: (id) =>
        update((s) => {
          const m = s.meds.find((x) => x.id === id);
          if (!m) return s;
          const next = withVersion(s, m.memberId, 'Deleted by hand', [{ kind: 'removed', medName: label(m) }]);
          const meds = next.meds.filter((x) => x.id !== id).map((x) => (x.overlapOk?.includes(id) ? { ...x, overlapOk: x.overlapOk.filter((o) => o !== id) } : x));
          return { ...next, meds };
        }),
      setExpiry: (medId, ym) => update((s) => ({ ...s, meds: s.meds.map((m) => (m.id === medId ? { ...m, expiry: ym } : m)) })),
      setProfile: (medId, profile) => update((s) => ({ ...s, meds: s.meds.map((m) => (m.id === medId ? { ...m, profile } : m)) })),
      confirmOverlap: (aId, bId) =>
        update((s) => {
          const a = s.meds.find((x) => x.id === aId);
          const b = s.meds.find((x) => x.id === bId);
          if (!a || !b) return s;
          const [na, nb] = confirmPair(a, b);
          const next = withVersion(s, a.memberId, 'Doctor confirmed both', [{ kind: 'edited', medName: label(a), detail: `Confirmed to be taken with ${label(b)}` }]);
          return { ...next, meds: next.meds.map((x) => (x.id === aId ? na : x.id === bId ? nb : x)) };
        }),
      record: (occs, status, method) =>
        update((s) => {
          const at = new Date().toISOString();
          const keys = new Set(occs.map((o) => o.key));
          const logs: DoseLog[] = occs.map((o) => ({
            id: uid(),
            key: o.key,
            memberId: o.memberId,
            medId: o.med.id,
            medName: medLabel(o.med),
            date: o.date,
            time: o.time,
            status,
            method,
            qty: o.dose.qty,
            at,
          }));
          // Replacing a log (e.g. missed -> taken late): give back stock taken by the old one.
          const replaced = s.logs.filter((l) => keys.has(l.key));
          const delta = new Map<string, number>();
          for (const l of replaced) if (l.status === 'taken') delta.set(l.medId, (delta.get(l.medId) ?? 0) + l.qty);
          if (status === 'taken') for (const l of logs) delta.set(l.medId, (delta.get(l.medId) ?? 0) - l.qty);
          const stock = [...s.stock];
          const meds = s.meds.map((m) => {
            const d = delta.get(m.id);
            if (!d) return m;
            stock.push({ id: uid(), medId: m.id, memberId: m.memberId, medName: medLabel(m), delta: d, reason: d < 0 ? 'dose' : 'undo', at });
            return { ...m, stock: Math.max(0, +(m.stock + d).toFixed(2)) };
          });
          return { ...s, meds, stock, logs: [...s.logs.filter((l) => !keys.has(l.key)), ...logs] };
        }),
      undo: (key) =>
        update((s) => {
          const log = s.logs.find((l) => l.key === key);
          if (!log) return s;
          const at = new Date().toISOString();
          let { meds, stock } = s;
          if (log.status === 'taken') {
            meds = meds.map((m) => (m.id === log.medId ? { ...m, stock: +(m.stock + log.qty).toFixed(2) } : m));
            stock = [...stock, { id: uid(), medId: log.medId, memberId: log.memberId, medName: log.medName, delta: log.qty, reason: 'undo', at }];
          }
          return { ...s, meds, stock, logs: s.logs.filter((l) => l.key !== key) };
        }),
      adjustStock: (medId, delta, reason) =>
        update((s) => {
          const med = s.meds.find((m) => m.id === medId);
          if (!med) return s;
          return {
            ...s,
            meds: s.meds.map((m) => (m.id === medId ? { ...m, stock: Math.max(0, +(m.stock + delta).toFixed(2)) } : m)),
            stock: [...s.stock, { id: uid(), medId, memberId: med.memberId, medName: medLabel(med), delta, reason, at: new Date().toISOString() }],
          };
        }),
      linkBarcode: (medId, code) =>
        update((s) => ({
          ...s,
          meds: s.meds.map((m) => (m.id === medId && !m.barcodes.includes(code) ? { ...m, barcodes: [...m.barcodes, code] } : m)),
        })),
      addOtherName: (medId, name) =>
        update((s) => ({
          ...s,
          meds: s.meds.map((m) =>
            m.id === medId && !m.aliases.some((a) => a.toLowerCase().replace(/\s+/g, ' ') === name.toLowerCase().replace(/\s+/g, ' '))
              ? { ...m, aliases: [...m.aliases, name] }
              : m,
          ),
        })),
      savePharmacies: (pharmacies) => update((s) => ({ ...s, pharmacies })),
      recordAnswer: (medIds, pharmacyId, answer, readyOn) =>
        update((s) => ({ ...s, meds: s.meds.map((m) => (medIds.includes(m.id) ? withAnswer(m, pharmacyId, answer, new Date(), readyOn) : m)) })),
      saveSettings: (settings) => update((s) => ({ ...s, settings })),
      importPerson: (file, intoMemberId) => {
        update((s) => {
          const r = mergePerson(s, file, deviceZone(), intoMemberId);
          const versioned = withVersion(s, r.memberId, `Sent from another phone (${file.exportedAt.slice(0, 10)})`, r.changes);
          return { ...r.state, history: versioned.history };
        });
        // The same merge on the state as shown, for the summary (the update above applies it to the latest state).
        return mergePerson(state, file, deviceZone(), intoMemberId);
      },
      replaceAll: (next) => update(() => next),
      setPending: (pending) => update((s) => ({ ...s, pending })),
      updatePendingItem: (id, patch) =>
        update((s) =>
          s.pending ? { ...s, pending: { ...s.pending, items: s.pending.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) } } : s,
        ),
      approvePending: () => {
        const p = state.pending;
        if (!p) return { added: 0, changed: 0, stopped: 0 };
        const member = state.members.find((m) => m.id === p.memberId);
        const describe = (m: Medication) => (member ? describeMedTimes(m, member, state.settings) : '');
        const drafts = p.items.filter((i) => i.include && i.checked).map((i) => ({ id: i.id, med: { ...i.med, memberId: p.memberId } }));
        const mine = state.meds.filter((m) => m.memberId === p.memberId);
        const plan = planPrescription(mine, drafts, describe);
        const when = new Date(p.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
        const at = new Date().toISOString();
        const { meds, changes } = applyPrescription(mine, drafts, plan, p.stopIds ?? [], at, `From prescription of ${when}.`);
        const source = p.items.map((i) => i.source).join('\n');
        update((s) => {
          const next = withVersion(s, p.memberId, `Prescription of ${when}`, changes.length ? changes : [{ kind: 'edited', medName: '—', detail: 'Prescription matched the schedule — no changes' }], source);
          return { ...next, meds: [...next.meds.filter((m) => m.memberId !== p.memberId), ...meds], pending: undefined };
        });
        return {
          added: changes.filter((c) => c.kind === 'added').length,
          changed: changes.filter((c) => c.kind === 'changed').length,
          stopped: changes.filter((c) => c.kind === 'stopped').length,
        };
      },
      mergeMembers: (fromId, intoId) =>
        update((s) => {
          if (fromId === intoId || !s.members.some((m) => m.id === intoId)) return s;
          const from = s.members.find((m) => m.id === fromId);
          if (!from) return s;
          const into = s.members.find((m) => m.id === intoId)!;
          const moved = s.meds.filter((m) => m.memberId === fromId).map((m) => ({ ...m, memberId: intoId }));
          let next = withVersion(s, intoId, `${from.name} combined into ${into.name}`, moved.map((m) => ({ kind: 'added' as const, medName: label(m), detail: `From ${from.name}` })));
          let meds = [...next.meds.filter((m) => m.memberId !== fromId), ...moved];
          let logs = next.logs.map((l) => (l.memberId === fromId ? { ...l, memberId: intoId } : l));
          let stock = next.stock.map((e) => (e.memberId === fromId ? { ...e, memberId: intoId } : e));
          const changes: ScheduleChange[] = [];
          for (const g of duplicateGroups(meds.filter((m) => m.memberId === intoId))) {
            const { med, removed, remap } = mergeGroup(g);
            const gone = new Set(removed);
            meds = meds.filter((m) => !gone.has(m.id)).map((m) => (m.id === med.id ? med : m));
            logs = remapLogs(logs, remap);
            stock = stock.map((e) => (gone.has(e.medId) ? { ...e, medId: med.id } : e));
            changes.push({ kind: 'merged', medName: label(med), detail: `${g.length} entries combined into one` });
          }
          // Two records for the same dose (one from each person): keep one.
          const seen = new Set<string>();
          logs = [...logs].reverse().filter((l) => (seen.has(l.key) ? false : (seen.add(l.key), true))).reverse();
          next = { ...next, meds, logs, stock, members: next.members.filter((m) => m.id !== fromId) };
          return changes.length ? { ...next, history: withVersion(next, intoId, 'Merged duplicates', changes).history } : next;
        }),
      mergeDuplicates: (memberId) => {
        const groups = duplicateGroups(state.meds.filter((m) => m.memberId === memberId));
        if (!groups.length) return 0;
        let removedCount = 0;
        update((s) => {
          let meds = s.meds;
          let logs = s.logs;
          let stock = s.stock;
          const changes: ScheduleChange[] = [];
          for (const g of duplicateGroups(s.meds.filter((m) => m.memberId === memberId))) {
            const { med, removed, remap } = mergeGroup(g);
            const gone = new Set(removed);
            meds = meds.filter((m) => !gone.has(m.id)).map((m) => (m.id === med.id ? med : m));
            logs = remapLogs(logs, remap);
            stock = stock.map((e) => (gone.has(e.medId) ? { ...e, medId: med.id } : e));
            removedCount += removed.length;
            changes.push({ kind: 'merged', medName: label(med), detail: `${g.length} entries combined into one` });
          }
          const next = withVersion(s, memberId, 'Merged duplicates', changes);
          return { ...next, meds, logs, stock };
        });
        return groups.reduce((n, g) => n + g.length - 1, 0);
      },
      teach: (medId, lines) =>
        update((s) => {
          const fp = fingerprint(lines);
          return { ...s, meds: s.meds.map((m) => (m.id === medId ? { ...m, learned: addLearned(m.learned, fp) } : m)) };
        }),
      forgetLearned: (medId) => update((s) => ({ ...s, meds: s.meds.map((m) => (m.id === medId ? { ...m, learned: [] } : m)) })),
      restoreVersion: (versionId) =>
        update((s) => {
          const v = s.history?.find((x) => x.id === versionId);
          if (!v) return s;
          const when = new Date(v.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
          const next = withVersion(s, v.memberId, `Restored version from ${when}`, [{ kind: 'restored', medName: '—', detail: `Went back to before "${v.reason}"` }]);
          const at = new Date().toISOString();
          // Restored doses only count from now, so nothing earlier today is marked missed.
          const currentDoseIds = new Set(s.meds.filter((m) => m.memberId === v.memberId).flatMap((m) => m.doses.map((d) => `${m.id}|${d.id}`)));
          const restored = v.before.map((m) => ({
            ...m,
            doses: m.doses.map((d) => (currentDoseIds.has(`${m.id}|${d.id}`) ? d : { ...d, since: at })),
          }));
          return { ...next, meds: [...next.meds.filter((m) => m.memberId !== v.memberId), ...restored] };
        }),
    }),
    [state, ready, now, update],
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}
