// Backup file: everything except photos, as one JSON file the person keeps wherever they like.
// Pure — no React Native — so it can be unit tested. See docs/specs/01-backup-restore.md.

import type { AppState, Settings } from './types.ts';

export const BACKUP_FORMAT = 1;

export interface BackupSummary {
  members: number;
  medicines: number;
  logs: number;
}

export interface BackupFile {
  app: 'medsync';
  kind: 'backup';
  format: number;
  exportedAt: string;
  summary: BackupSummary;
  state: AppState;
}

export type ParseResult =
  | { ok: true; state: AppState; exportedAt: string; summary: BackupSummary; droppedMeds: number }
  | { ok: false; error: string };

const summarize = (s: AppState): BackupSummary => ({ members: s.members.length, medicines: s.meds.length, logs: s.logs.length });

/** The backup file for the current data. Photos and a prescription waiting for review are left out. */
export function makeBackup(state: AppState, now = new Date()): BackupFile {
  const { pending: _pending, ...rest } = state;
  const clean: AppState = { ...rest };
  return { app: 'medsync', kind: 'backup', format: BACKUP_FORMAT, exportedAt: now.toISOString(), summary: summarize(clean), state: clean };
}

export function backupFileName(now = new Date()): string {
  return `TakeSure backup ${now.toISOString().slice(0, 10)}.json`;
}

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Checks a backup file and rebuilds a complete, safe state from it. Nothing is changed until the caller applies it. */
export function parseBackup(text: string, defaults: Settings): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not a TakeSure backup (it could not be read).' };
  }
  const f = data as Partial<BackupFile> | null;
  if (!f || typeof f !== 'object' || f.app !== 'medsync' || f.kind !== 'backup') return { ok: false, error: 'This file is not a TakeSure backup.' };
  if (typeof f.format !== 'number' || f.format > BACKUP_FORMAT) return { ok: false, error: 'This backup was made by a newer version of TakeSure. Update the app, then restore it.' };
  const s = f.state as Partial<AppState> | undefined;
  if (!s || typeof s !== 'object' || !Array.isArray(s.members) || !s.members.length) return { ok: false, error: 'This backup is incomplete (no family members in it).' };

  const members = arr<AppState['members'][number]>(s.members).filter((m) => m && typeof m.id === 'string' && typeof m.name === 'string');
  if (!members.length) return { ok: false, error: 'This backup is incomplete (no family members in it).' };
  const ids = new Set(members.map((m) => m.id));
  const allMeds = arr<AppState['meds'][number]>(s.meds).filter((m) => m && typeof m.id === 'string');
  const meds = allMeds.filter((m) => ids.has(m.memberId));
  const state: AppState = {
    ...(s as AppState),
    version: 1,
    members,
    meds,
    logs: arr(s.logs),
    stock: arr(s.stock),
    history: arr(s.history),
    ...(Array.isArray(s.pharmacies)
      ? { pharmacies: arr<NonNullable<AppState['pharmacies']>[number]>(s.pharmacies).filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string') }
      : {}),
    settings: { ...defaults, ...(s.settings ?? {}) },
  };
  delete state.pending;
  return { ok: true, state, exportedAt: typeof f.exportedAt === 'string' ? f.exportedAt : '', summary: summarize(state), droppedMeds: allMeds.length - meds.length };
}

/** "today", "yesterday", "12 days ago" — for "Last backup: …". */
export function ageText(iso: string | undefined, now = new Date()): string {
  if (!iso) return 'never';
  const days = Math.floor((startOfDay(now) - startOfDay(new Date(iso))) / 864e5);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** True when there is something worth saving and no backup in the last 30 days. */
export function backupOverdue(state: AppState, now = new Date()): boolean {
  if (!state.meds.length) return false;
  const last = state.settings.lastBackupAt;
  return !last || now.getTime() - new Date(last).getTime() > 30 * 864e5;
}
