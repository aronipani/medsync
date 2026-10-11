import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState as RNAppState } from 'react-native';
import { computeMissed, medLabel } from './schedule.ts';
import type { AppState, DoseLog, LogMethod, LogStatus, Medication, Member, Occurrence, Settings } from './types.ts';

const KEY = 'medsync:v1';

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const MEMBER_COLORS = ['#0F766E', '#7C3AED', '#C2410C', '#0369A1', '#BE185D', '#4D7C0F'];

export const DEFAULT_SETTINGS: Settings = {
  mealOffsetMin: 30,
  dueWindowMin: 60,
  missedAfterMin: 120,
  followUpMin: 30,
  snoozeMin: 10,
};

export function newMember(name: string, index: number): Member {
  return {
    id: uid(),
    name,
    color: MEMBER_COLORS[index % MEMBER_COLORS.length],
    mealTimes: { breakfast: '08:30', lunch: '13:30', dinner: '20:30' },
  };
}

const initialState = (): AppState => ({
  version: 1,
  members: [newMember('Me', 0)],
  meds: [],
  logs: [],
  stock: [],
  settings: DEFAULT_SETTINGS,
});

const LOG_RETENTION_DAYS = 365;

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
  saveSettings(s: Settings): void;
  replaceAll(s: AppState): void;
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
        update((s) => ({
          ...s,
          meds: s.meds.some((x) => x.id === m.id) ? s.meds.map((x) => (x.id === m.id ? m : x)) : [...s.meds, m],
        })),
      deleteMed: (id) => update((s) => ({ ...s, meds: s.meds.filter((m) => m.id !== id) })),
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
      saveSettings: (settings) => update((s) => ({ ...s, settings })),
      replaceAll: (next) => update(() => next),
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
