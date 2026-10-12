// Pure matching logic: does scanned text / barcode belong to a medication?
// Built for Indian strips where the brand + strength is printed on foil, e.g. "DOLO-650", "Telma 40".

import { relatedNames } from './drugdb.ts';
import type { Medication } from './types.ts';

const NOISE = new Set([
  'MG', 'MCG', 'ML', 'GM', 'G', 'IU', 'TAB', 'TABS', 'TABLET', 'TABLETS', 'CAP', 'CAPS', 'CAPSULE',
  'CAPSULES', 'IP', 'BP', 'USP', 'SYRUP', 'SUSP', 'INJ', 'STRIP', 'OF',
]);

/** Uppercase, split on non-alphanumerics and on letter/digit boundaries ("DOLO650MG" -> DOLO 650 MG). */
export function tokenize(s: string): string[] {
  return s
    .toUpperCase()
    .replace(/(\d)[.,](\d)/g, '$1_$2') // keep decimals like 2.5 together
    .replace(/[^A-Z0-9_]+/g, ' ')
    .replace(/([A-Z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Z])/g, '$1 $2')
    .split(' ')
    .map((t) => t.replace('_', '.'))
    .filter(Boolean);
}

const isNumeric = (t: string) => /^\d+(\.\d+)?$/.test(t);

/** OCR often confuses letters and digits in numbers (65O, I0, S00). */
function asDigits(t: string): string {
  return t.replace(/[OQD]/g, '0').replace(/[IL|]/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/Z/g, '2');
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

const tolerance = (len: number) => (len >= 8 ? 2 : len >= 4 ? 1 : 0);

function wordPresent(word: string, textTokens: string[], joined: string[]): boolean {
  const tol = tolerance(word.length);
  return [...textTokens, ...joined].some((t) => Math.abs(t.length - word.length) <= tol && levenshtein(t, word) <= tol);
}

function numberPresent(num: string, textTokens: string[]): boolean {
  return textTokens.some((t) => t === num || (t.length === num.length && asDigits(t) === num));
}

export interface TextMatch {
  matched: boolean;
  nameFound: boolean; // the name matched but the strength did not
  candidate?: string;
}

/** Names a medication may be printed as: "name strength" plus aliases. */
export function candidatesFor(med: Pick<Medication, 'name' | 'strength' | 'aliases'>): string[] {
  // "Ismo / Monotrate" means either brand.
  const names = med.name.split(/\s*\/\s*/).filter(Boolean);
  return [...names.map((n) => `${n} ${med.strength}`), ...med.aliases].map((s) => s.trim()).filter(Boolean);
}

/** OCR reads O as 0, S as 5 inside words ("THYR0NORM"). */
function asLetters(t: string): string {
  return t.replace(/0/g, 'O').replace(/1/g, 'I').replace(/5/g, 'S').replace(/8/g, 'B');
}

/** Tokens to search in: split tokens plus whole alphanumeric words (raw and letter-corrected). */
function textTokens(text: string): string[] {
  const raw = text.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  const mixed = raw.filter((t) => /[A-Z]/.test(t) && /\d/.test(t));
  // "MONOTRATE®10" is often read as "MONOTRATE810" / "MONOTRATE910": the ® became a digit.
  const regMark = mixed.flatMap((t) => {
    const m = /^([A-Z]{3,})[89](\d{1,4})$/.exec(t);
    return m ? [m[1], m[2]] : [];
  });
  return [...new Set([...tokenize(text), ...mixed, ...mixed.map(asLetters), ...regMark])];
}

export function matchText(text: string, med: Pick<Medication, 'name' | 'strength' | 'aliases'>): TextMatch {
  const toks = textTokens(text);
  // OCR sometimes splits a word ("DO LO") — also try adjacent pairs joined.
  const base = tokenize(text);
  const joined = base.slice(1).map((t, i) => base[i] + t);
  let nameFound = false;
  for (const cand of candidatesFor(med)) {
    const words = tokenize(cand).filter((w) => !NOISE.has(w));
    const names = words.filter((w) => !isNumeric(w));
    const nums = words.filter(isNumeric);
    if (!names.length) continue;
    const namesOk = names.every((w) => wordPresent(w, toks, joined));
    if (!namesOk) continue;
    nameFound = true;
    if (nums.every((n) => numberPresent(n, toks))) return { matched: true, nameFound: true, candidate: cand };
  }
  return { matched: false, nameFound };
}

/** Normalise a barcode / QR payload. GS1 codes yield their GTIN so box and strip codes compare equal. */
export function normalizeCode(raw: string): string {
  const s = raw.trim().replace(/[\u001d\s]/g, '');
  const gs1 = /\(01\)(\d{14})/.exec(s) ?? (s.length > 16 ? /^01(\d{14})/.exec(s) : null);
  if (gs1) return `GTIN:${gs1[1]}`;
  if (/^\d{8,14}$/.test(s)) return `GTIN:${s.padStart(14, '0')}`;
  return s.toUpperCase();
}

export function matchBarcode(raw: string, med: Pick<Medication, 'barcodes' | 'name' | 'strength' | 'aliases'>): boolean {
  const code = normalizeCode(raw);
  if (med.barcodes.some((b) => normalizeCode(b) === code)) return true;
  // Many Indian QR codes carry the product name as text.
  return /[A-Za-z]{3,}/.test(raw) && matchText(raw, med).matched;
}

// ---------- Detailed result for dose checking ----------

export type MatchLevel = 'match' | 'substitute' | 'nameOnly' | 'otherStrength' | 'none';

export interface MatchDetail {
  level: MatchLevel;
  via?: string; // the name that matched, e.g. "Clopidogrel 75" or "Plavix 75"
  foundStrengths?: string[]; // strengths printed on the strip when they differ from the prescription
}

const STRENGTH_IN_TEXT = /(\d+(?:\.\d+)?)\s*(mg|mcg|µg|ug|iu|k)\b/gi;

/**
 * How well a strip matches a scheduled medicine:
 *  - match: name (or its contents) and strength both found
 *  - substitute: another brand of the same medicine and strength (from the built-in list)
 *  - nameOnly: the name is there but no strength could be read (torn / glare) — a person should check
 *  - otherStrength: the name is there with a different strength printed — don't take
 *  - none: not this medicine
 */
export function matchDetail(text: string, med: Pick<Medication, 'name' | 'strength' | 'aliases'>): MatchDetail {
  const own = matchText(text, med);
  if (own.matched) return { level: 'match', via: own.candidate };

  const rel = relatedNames(med);
  const extra = [rel.generic, ...rel.otherBrands].filter((x): x is string => !!x);
  const relMatch = extra.length ? matchText(text, { name: '', strength: '', aliases: extra }) : { matched: false, nameFound: false };
  if (relMatch.matched) return { level: relMatch.candidate === rel.generic ? 'match' : 'substitute', via: relMatch.candidate };

  if (!own.nameFound && !relMatch.nameFound) return { level: 'none' };
  const expected = new Set(med.strength.split('/').map((x) => x.replace(/[^\d.]/g, '')));
  const found = [...new Set([...text.matchAll(STRENGTH_IN_TEXT)].map((m) => m[1]))].filter((x) => !expected.has(x));
  return found.length ? { level: 'otherStrength', foundStrengths: found } : { level: 'nameOnly' };
}
