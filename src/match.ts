// Pure matching logic: does scanned text / barcode belong to a medication?
// Built for Indian strips where the brand + strength is printed on foil, e.g. "DOLO-650", "Telma 40".

import { sameMedicine } from './consolidate.ts';
import { DRUGS, lookupBrand, lookupIngredients, relatedNames } from './drugdb.ts';
import { differenceMessage, exchangeable, formLabel } from './substitute.ts';
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

// Strict: look-alike medicine names differ by one or two letters, so only small OCR slips are forgiven.
const tolerance = (len: number) => (len >= 10 ? 2 : len >= 5 ? 1 : 0);

// Distinctive words of known medicine contents ("ISOSORBIDE", "CLOPIDOGREL", "HYDROCHLOROTHIAZIDE").
const GENERIC_WORDS = new Set(['ACID', 'VITAMIN', 'CALCIUM', 'SODIUM', 'POTASSIUM', 'MAGNESIUM', 'MULTIVITAMIN', 'CHOLECALCIFEROL']);
const INGREDIENT_WORDS: Set<string> = new Set(
  DRUGS.flatMap((d) => d.ingredients.flatMap((i) => i.toUpperCase().split(/\s+/))).filter((w) => w.length >= 6 && !GENERIC_WORDS.has(w)),
);

function wordPresent(word: string, textTokens: string[], joined: string[]): boolean {
  const tol = tolerance(word.length);
  return [...textTokens, ...joined].some((t) => {
    if (t === word) return true;
    // A real medicine word on the strip ("MONONITRATE") is not a misread of a different name ("MONOTRATE").
    if (INGREDIENT_WORDS.has(t) && !INGREDIENT_WORDS.has(word)) return false;
    return Math.abs(t.length - word.length) <= tol && levenshtein(t, word) <= tol;
  });
}

/**
 * Text with the numbers that are never a strength removed: price, batch, dates, licence numbers
 * and pack counts ("per 10 Tablets", "15 Tablets", "Pack of 10").
 */
export function strengthText(text: string): string {
  return text
    .split('\n')
    .map((l) =>
      l
        // From a price / batch / date / licence word to the end of the line.
        .replace(/(\b(m\.?\s?r\.?\s?p|rs\.?|price|b\.?\s?no|batch|lot|mfg|mfd|exp|expiry|lic|m\.?\s?l\.?|reg|incl|taxes)\b|₹).*$/i, ' ')
        .replace(/\b(per|of|pack of|strip of|x)\s*\d+\s*(tablets?|tabs?|capsules?|caps?)\b/gi, ' ')
        .replace(/^\s*\d+\s*(tablets?|tabs?|capsules?|caps?)\s*$/gi, ' ')
        .replace(/\b\d{1,2}\s*[/.-]\s*\d{2,4}\b/g, ' '),
    )
    .join('\n');
}

function numberPresent(num: string, textTokens: string[]): boolean {
  return textTokens.some((t) => t === num || (t.length === num.length && asDigits(t) === num));
}

export interface TextMatch {
  matched: boolean;
  nameFound: boolean; // the name matched but the strength did not
  candidate?: string;
}

const SALTS = ['SULFATE', 'SULPHATE', 'HYDROCHLORIDE', 'BISULFATE', 'BISULPHATE', 'BESYLATE', 'BESILATE', 'MALEATE', 'TARTRATE', 'SUCCINATE',
  'SODIUM', 'POTASSIUM', 'CALCIUM', 'MAGNESIUM', 'MESYLATE', 'FUMARATE', 'CITRATE', 'PHOSPHATE', 'ACETATE', 'HYDROBROMIDE'];
/** "SULF", "HYDROCHLOR": the start of a salt word, cut off when the strip was read. */
const cutSalt = (w: string) => w.length >= 4 && /^[A-Z]+$/.test(w) && SALTS.some((x) => x.length > w.length && x.startsWith(w));

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
  const numToks = textTokens(strengthText(text));
  // OCR sometimes splits a word ("DO LO") — also try adjacent pairs joined.
  const base = tokenize(text);
  const joined = base.slice(1).map((t, i) => base[i] + t);
  let nameFound = false;
  for (const cand of candidatesFor(med)) {
    const words = tokenize(cand).filter((w) => !NOISE.has(w));
    const names = words.filter((w) => !isNumeric(w));
    const nums = words.filter(isNumeric);
    if (!names.length) continue;
    // A name saved from a cut-off read ("Albuterol Sulf") keeps the cut salt word: it is found when a printed word
    // starts with it ("SULFATE"). Only salt words, so a different salt (tartrate vs succinate) still doesn't match.
    const namesOk = names.every((w) => wordPresent(w, toks, joined) || (cutSalt(w) && toks.some((t) => t.startsWith(w))));
    if (!namesOk) continue;
    nameFound = true;
    if (nums.every((n) => numberPresent(n, numToks))) return { matched: true, nameFound: true, candidate: cand };
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

export type MatchLevel = 'match' | 'substitute' | 'nameOnly' | 'otherStrength' | 'conflict' | 'none';

export interface MatchDetail {
  level: MatchLevel;
  via?: string; // the name that matched, e.g. "Clopidogrel 75" or "Plavix 75"
  foundStrengths?: string[]; // strengths printed on the strip when they differ from the prescription
  looksLike?: string; // conflict: what the strip appears to be instead
  askDoctor?: boolean; // substitute of a medicine where a change of maker needs the doctor (spec 17)
  note?: string; // nameOnly: why a person has to check ("Can't tell if this is the same as Metolar 25.")
}

const STRENGTH_IN_TEXT = /(\d+(?:\.\d+)?)\s*(mg|mcg|µg|ug|iu|k)\b/gi;

type Med = Pick<Medication, 'name' | 'strength' | 'aliases'>;

const keywordsOf = (ingredients: string[]) =>
  new Set(ingredients.flatMap((i) => i.toUpperCase().split(/\s+/)).filter((w) => INGREDIENT_WORDS.has(w)));

function entryFor(med: Med) {
  return (
    lookupBrand(med.name) ??
    med.aliases.map((a) => lookupBrand(a.replace(/\b\d.*$/, '').trim())).find(Boolean) ??
    lookupIngredients(med.name.split(/\s*\+\s*/))[0] ??
    med.aliases.map((a) => lookupIngredients(a.replace(/\s*\d+(\.\d+)?\s*(mg|mcg)?/gi, '').split(/\s*\+\s*/))[0]).find(Boolean)
  );
}

/** Every word of the name printed exactly (OCR digit/letter slips allowed), e.g. "CILACAR" + "T". */
function namePrintedExactly(name: string, toks: Set<string>): boolean {
  const ws = tokenize(name).filter((w) => !NOISE.has(w) && !isNumeric(w));
  if (!ws.length || ws.join('').length < 4) return false;
  return ws.every((w) => toks.has(w));
}

/**
 * Is there stronger evidence that this strip is a DIFFERENT medicine than the one expected?
 *  - it contains a medicine the expected one doesn't (Telma H has hydrochlorothiazide; Cilacar T has telmisartan), or
 *  - another known medicine's name is printed exactly while the expected name is only a near match,
 *    or the other name is the more specific one ("Cilacar T" vs "Cilacar").
 */
export function findConflict(text: string, med: Med, others: Med[] = []): string | undefined {
  const toks = new Set(textTokens(text));
  const entry = entryFor(med);
  if (entry) {
    const own = keywordsOf(entry.ingredients);
    const extra = [...toks].filter((t) => INGREDIENT_WORDS.has(t) && !own.has(t));
    if (extra.length) {
      const fit = DRUGS.filter((d) => [...keywordsOf(d.ingredients)].some((k) => extra.includes(k))).sort(
        (a, b) => Number(namePrintedExactly(b.brands[0], toks)) - Number(namePrintedExactly(a.brands[0], toks)) || b.ingredients.length - a.ingredients.length,
      )[0];
      const printed = fit?.brands.find((b) => namePrintedExactly(b, toks));
      return printed ?? (fit ? `a medicine containing ${fit.ingredients.join(' + ')}` : `a medicine containing ${extra.join(', ').toLowerCase()}`);
    }
  }
  const ownExact = med.name.split(/\s*\/\s*/).some((n) => namePrintedExactly(n, toks)) || med.aliases.some((a) => namePrintedExactly(a, toks));
  const rivals: { name: string; strength: string }[] = [
    ...others.filter((o) => !sameMedicine(o, med)).map((o) => ({ name: o.name, strength: o.strength })),
    ...DRUGS.flatMap((d) => d.brands.map((b) => ({ name: b, strength: '' }))).filter((r) => !sameMedicine({ name: r.name, aliases: [] }, med)),
  ];
  const ownWords = tokenize(med.name).filter((w) => !NOISE.has(w) && !isNumeric(w));
  for (const r of rivals) {
    if (!namePrintedExactly(r.name, toks)) continue;
    const rWords = tokenize(r.name).filter((w) => !NOISE.has(w) && !isNumeric(w));
    const moreSpecific = ownWords.length > 0 && ownWords.every((w) => rWords.includes(w)) && rWords.length > ownWords.length;
    if (!ownExact || moreSpecific) return `${r.name} ${r.strength}`.trim();
  }
  return undefined;
}

/**
 * How well a strip matches a scheduled medicine:
 *  - match: name (or its contents) and strength both found, and nothing points to a different medicine
 *  - substitute: another brand of the same medicine and strength (from the built-in list)
 *  - nameOnly: the name is there but no strength could be read (torn / glare) — a person should check
 *  - otherStrength: the name is there with a different strength printed — don't take
 *  - conflict: the strip looks like a different medicine (see looksLike) — don't take
 *  - none: not this medicine
 * `others` are the household's other medicines, used to spot a different medicine on the strip.
 */
export function matchDetail(text: string, med: Med, others: Med[] = []): MatchDetail {
  const base = baseDetail(text, med);
  if (base.level === 'none') return base;
  const looksLike = findConflict(text, med, others);
  return looksLike ? { level: 'conflict', looksLike } : base;
}

function baseDetail(text: string, med: Med): MatchDetail {
  const own = matchText(text, med);
  if (own.matched) return { level: 'match', via: own.candidate };

  const rel = relatedNames(med);
  const extra = [rel.generic, ...rel.otherBrands].filter((x): x is string => !!x);
  const relMatch = extra.length ? matchText(text, { name: '', strength: '', aliases: extra }) : { matched: false, nameFound: false };
  if (relMatch.matched) return checkedRelated(text, med, relMatch.candidate ?? '', relMatch.candidate === rel.generic);

  if (!own.nameFound && !relMatch.nameFound) return { level: 'none' };
  const expected = new Set(med.strength.split('/').map((x) => x.replace(/[^\d.]/g, '')));
  const found = printedStrengths(text, med, rel.generic).filter((x) => !expected.has(x));
  return found.length ? { level: 'otherStrength', foundStrengths: found } : { level: 'nameOnly' };
}

// Words a bare number can follow without being a strength (addresses, counts, licence lines).
const NOT_BEFORE_STRENGTH = new Set(['PER', 'OF', 'EACH', 'NO', 'LIC', 'REG', 'PIN', 'CONTAINS', 'TABLETS', 'TABS', 'CAPSULES', 'PACK', 'STRIP']);

/**
 * Strengths printed on a strip: numbers with a unit ("40 mg"), and a bare number right after a name that
 * belongs to this medicine's family ("Pantodac 40" for Pan or pantoprazole, "Dolo 650"). Strips usually print the
 * brand's strength without "mg", and missing it let a 40 mg strip pass as a check for Pan 20.
 */
export function printedStrengths(text: string, med: Med, generic?: string): string[] {
  const t = strengthText(text);
  const withUnit = [...t.matchAll(STRENGTH_IN_TEXT)].map((m) => m[1]);
  const own = tokenize(med.name.split(/\s*\/\s*/)[0] ?? '').find((w) => /^[A-Z]{3,}$/.test(w));
  const gen = generic ? tokenize(generic)[0] : undefined;
  const family = (w: string) =>
    !NOT_BEFORE_STRENGTH.has(w) &&
    ((own !== undefined && w.startsWith(own)) || (gen !== undefined && gen.length >= 4 && w.length >= 4 && w.slice(0, 4) === gen.slice(0, 4)) || !!lookupBrand(w));
  const bare = [...t.matchAll(/\b([A-Za-z]{3,})[®™]?\s*(\d{1,4}(?:\.\d+)?)(?![\d.]|\s*(?:%|tablets?|tabs?|capsules?|caps?)\b)/g)]
    .filter((m) => family(m[1].toUpperCase()))
    .map((m) => m[2]);
  return [...new Set([...withUnit, ...bare])];
}

/**
 * Did the scan read a medicine at all — a known brand, a medicine's contents, or one of the household's names?
 * When it didn't, a "no match" is a reading problem (glare, angle, wrong side), not a wrong medicine,
 * and the person is told how to scan again rather than "wrong medicine".
 */
export function readsAsMedicine(text: string, household: Med[] = []): boolean {
  const toks = new Set(textTokens(text));
  if ([...toks].some((t) => INGREDIENT_WORDS.has(t))) return true;
  const names = [...DRUGS.flatMap((d) => d.brands), ...household.flatMap((m) => [...m.name.split(/\s*\/\s*/), ...m.aliases])];
  return names.some((n) => tokenize(n).filter((w) => !NOISE.has(w) && !isNumeric(w)).join('').length >= 4 && namePrintedExactly(n, toks));
}

/**
 * The strip shows the medicine's generic name or another brand of the same contents. Only say so when it is exactly
 * the same medicine (spec 17): same strength, same release form, same salt. A different form or salt is a different
 * medicine (Metolar = metoprolol tartrate; Met XL = metoprolol succinate, extended-release); when it can't be told, or
 * the medicine is one where a change of maker needs the doctor (amiodarone, thyroxine …), a person checks.
 */
function checkedRelated(text: string, med: Med, via: string, generic: boolean): MatchDetail {
  const strength = med.strength.replace(/\s*mg\b/i, '').trim();
  const brand = strength && via.endsWith(strength) ? via.slice(0, -strength.length).trim() : via;
  const c = exchangeable({ name: med.name, strength: med.strength, aliases: med.aliases }, { name: brand, strength: med.strength, printed: text });
  if (c.reasons.length) {
    const form = c.reasons.includes('form') ? formLabel(c.form.strip) : c.reasons.includes('salt') ? c.salt.strip : undefined;
    return { level: 'conflict', looksLike: form ? `${via} (${form})` : via };
  }
  if (c.unknown.length) return { level: 'nameOnly', via, note: differenceMessage(c, { name: med.name, strength: med.strength }, { name: brand, strength: med.strength }) };
  if (generic) return { level: 'match', via };
  return c.askBeforeSwap ? { level: 'substitute', via, askDoctor: true } : { level: 'substitute', via };
}
