// Strip profiles (spec 15): what a fresh strip of a medicine looks like, kept on the phone and used at dose time.
// Pure — no React Native — so it can be unit tested. Photo files are handled in profileFiles.ts.

import { householdMatch } from './household.ts';
import { fingerprint } from './learn.ts';
import { matchDetail } from './match.ts';
import type { Medication, StripProfile } from './types.ts';

export const MAX_REFS = 4; // rolling photos from dose scans; the fresh-strip anchors are kept besides these
const MAX_WORDS = 24;

/** Distinctive words from what was read on a fresh strip: brand and contents lines, no addresses/prices/batch. */
export function profileWords(lines: string[]): string[] {
  return fingerprint(lines)
    .filter((w) => /^[A-Z]{4,}$/.test(w))
    .slice(0, MAX_WORDS);
}

export function buildProfile(lines: string[], sides: number, prev?: StripProfile, now = new Date()): StripProfile {
  // Words from an earlier profile are kept: a new scan may miss what an earlier one read.
  const words = [...new Set([...profileWords(lines), ...(prev?.words ?? [])])].slice(0, MAX_WORDS);
  return { version: 1, source: 'phone', at: now.toISOString(), words, sides: Math.max(sides, prev?.sides ?? 0), anchors: prev?.anchors, refs: prev?.refs };
}

/** Every photo file a profile holds (to delete them with the medicine). */
export const profileFilesOf = (p: StripProfile | undefined): string[] => [...(p?.anchors ?? []), ...(p?.refs ?? [])];

/** Newest reference first; returns the list to keep and the files to delete. */
export function addRef(refs: string[] | undefined, file: string): { refs: string[]; drop: string[] } {
  const all = [file, ...(refs ?? []).filter((r) => r !== file)];
  return { refs: all.slice(0, MAX_REFS), drop: all.slice(MAX_REFS) };
}

export type EnrollCheck =
  | { kind: 'ok'; strengthRead: boolean } // the strip shows this medicine's name (and strength, when strengthRead)
  | { kind: 'other'; looksLike: string } // the strip looks like a different medicine: don't save
  | { kind: 'unread' }; // this medicine's name couldn't be found on the strip

/**
 * Before saving a profile, check the strip really is this medicine — a profile made from the wrong strip would
 * teach the scanner a mistake. Uses the same rules as the dose-time scan, against the whole household.
 */
export function checkEnroll(text: string, med: Medication, household: Medication[]): EnrollCheck {
  const others = household.filter((m) => m.active && m.id !== med.id);
  const d = matchDetail(text, med, [...others, med]);
  if (d.level === 'match' || d.level === 'substitute') return { kind: 'ok', strengthRead: true };
  if (d.level === 'nameOnly') return { kind: 'ok', strengthRead: false };
  if (d.level === 'conflict') return { kind: 'other', looksLike: d.looksLike ?? 'another medicine' };
  if (d.level === 'otherStrength') return { kind: 'other', looksLike: `${med.name} ${d.foundStrengths?.join(' / ') ?? ''} mg`.trim() };
  // Worn print: the household matcher may still tell which medicine it is.
  const hh = householdMatch(text, [...others, med]);
  if ((hh.kind === 'sure' || hh.kind === 'likely') && hh.medId !== med.id) {
    const m = others.find((o) => o.id === hh.medId);
    return { kind: 'other', looksLike: m ? `${m.name} ${m.strength}`.trim() : 'another medicine' };
  }
  return { kind: 'unread' };
}

/** Medicines worth scanning once: active, not yet profiled. For a gentle suggestion, never at dose time. */
export const needsProfile = (m: Medication) => m.active && !m.profile;
