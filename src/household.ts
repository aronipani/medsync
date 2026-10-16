// Closed-set matching (spec 15): which of THIS household's medicines is this strip, from fragments?
// Used after the strict matcher (match.ts) finds nothing: a worn or cut strip may only show "…LOPIL…" and "75",
// which is enough to tell Clopilet 75 apart from the household's other 2–25 medicines — but never enough to
// accept a look-alike. Pure — no React Native — so it can be unit tested.

import { sameMedicine } from './consolidate.ts';
import { levenshtein, strengthText, tokenize } from './match.ts';
import { decode } from './learn.ts';
import type { Medication } from './types.ts';

type Med = Pick<Medication, 'id' | 'name' | 'strength' | 'aliases'> & { learned?: string[] };

// Words printed on many strips; they say nothing about which medicine it is.
const COMMON = new Set([
  'TABLET', 'TABLETS', 'TAB', 'TABS', 'CAPSULE', 'CAPSULES', 'CAP', 'CAPS', 'IP', 'BP', 'USP', 'MG', 'MCG', 'ML', 'IU',
  'EACH', 'FILM', 'COATED', 'UNCOATED', 'CONTAINS', 'RELEASE', 'PROLONGED', 'EXTENDED', 'SUSTAINED', 'MODIFIED',
  'STRIP', 'PACK', 'BATCH', 'EXPIRY', 'PHARMA', 'LIMITED', 'LTD', 'HEALTHCARE', 'LABORATORIES', 'SCHEDULE', 'DRUG',
  'STORE', 'PROTECT', 'LIGHT', 'MOISTURE', 'CHILDREN', 'REACH', 'DOSAGE', 'DIRECTED', 'PHYSICIAN', 'INDIA',
]);

const MIN_RUN = 4; // fewest letters a fragment must share with a name to count
const MIN_COVER = 0.5; // share of the name's letters that must be seen (across all fragments)
const MARGIN = 1.5; // the best medicine must score this many times the next one
const SURE_COVER = 0.6; // name coverage needed (with strength and no look-alike) for green

/** OCR reads O as 0, I as 1 inside words. */
const letters = (t: string) => t.replace(/0/g, 'O').replace(/1/g, 'I').replace(/5/g, 'S').replace(/8/g, 'B');

/** Distinctive name words of a medicine: brand words, alias words, taught-strip words (no numbers, no common print). */
export function nameWords(med: Med): string[] {
  const src = [med.name.replace(/\s*\/\s*/g, ' '), ...med.aliases];
  const words = src.flatMap(tokenize).filter((w) => /^[A-Z]+$/.test(w) && w.length >= MIN_RUN && !COMMON.has(w));
  const taught = (med.learned ?? []).flatMap(decode).filter((w) => /^[A-Z]{5,}$/.test(w) && !COMMON.has(w));
  return [...new Set([...words, ...taught])];
}

/**
 * Letters of `word` covered by `frag`: the longest stretch where they agree, allowing one OCR slip
 * per 6 letters. Returns the covered positions in `word` (empty if shorter than MIN_RUN).
 */
export function covered(frag: string, word: string): number[] {
  let best: number[] = [];
  for (let off = -frag.length + MIN_RUN; off <= word.length - MIN_RUN; off++) {
    // Slide frag along word; inside the overlap find the longest run with few mismatches.
    const start = Math.max(0, off);
    const end = Math.min(word.length, off + frag.length);
    for (let s = start; s < end; s++) {
      let slips = 0;
      for (let e = s; e < end; e++) {
        if (word[e] !== frag[e - off]) slips++;
        const len = e - s + 1;
        if (slips > Math.floor(len / 6)) break;
        if (len >= MIN_RUN && len > best.length && word[s] === frag[s - off] && word[e] === frag[e - off]) {
          best = Array.from({ length: len }, (_, i) => s + i);
        }
      }
    }
  }
  return best;
}

/** How much of the medicine's best name word the scan shows, 0…1, joining fragments from several printed copies. */
export function nameCover(fragments: string[], word: string): number {
  const seen = new Set<number>();
  for (const f of fragments) for (const i of covered(f, word)) seen.add(i);
  return seen.size >= MIN_RUN ? seen.size / word.length : 0;
}

const numbersOf = (s: string) => (s.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);

/** Strength printed: 'same' when the medicine's strength is there, 'other' when only a different mg strength is. */
export function strengthSeen(text: string, strength: string): 'same' | 'other' | 'unknown' {
  const want = numbersOf(strength);
  if (!want.length) return 'unknown';
  const clean = strengthText(text);
  const nums = tokenize(clean).map((t) => t.replace(/[OQD]/g, '0').replace(/[IL]/g, '1')).filter((t) => /^\d+(\.\d+)?$/.test(t)).map(Number);
  if (want.every((n) => nums.includes(n))) return 'same';
  const mgs = [...clean.matchAll(/(\d+(?:\.\d+)?)\s*(mg|mcg)\b/gi)].map((m) => Number(m[1]));
  return mgs.length && !mgs.some((n) => want.includes(n)) ? 'other' : 'unknown';
}

/** Two household medicines that are easy to confuse: same contents, or brand names a letter or two apart. */
export function lookAlike(a: Med, b: Med): boolean {
  if (a.id === b.id) return false;
  if (sameMedicine(a, b)) return true;
  const an = nameWords({ ...a, aliases: [], learned: [] });
  const bn = nameWords({ ...b, aliases: [], learned: [] });
  return an.some((x) => bn.some((y) => x.slice(0, 4) === y.slice(0, 4) || levenshtein(x, y) <= 2));
}

export interface Candidate {
  medId: string;
  cover: number; // 0…1 of the best-matching name word
  word: string; // which name word
  strength: 'same' | 'other' | 'unknown';
  score: number;
}

export type Verdict =
  | { kind: 'sure'; medId: string; candidates: Candidate[] } // green allowed (if due for this person)
  | { kind: 'likely'; medId: string; candidates: Candidate[] } // amber: probably this one, person checks
  | { kind: 'unsure'; candidates: Candidate[] } // several fit: scan the other side
  | { kind: 'none'; candidates: Candidate[] };

/**
 * Scores every active household medicine (all members) against the text read, and decides.
 * Being due is deliberately NOT an input: it must never turn an uncertain scan into a green.
 */
export function householdMatch(text: string, meds: Med[]): Verdict {
  const fragments = [...new Set(tokenize(text).map(letters).filter((t) => /^[A-Z]{4,}$/.test(t) && !COMMON.has(t)))];
  const candidates: Candidate[] = [];
  for (const med of meds) {
    let best = { cover: 0, word: '' };
    for (const w of nameWords(med)) {
      const c = nameCover(fragments, w);
      if (c > best.cover) best = { cover: c, word: w };
    }
    if (best.cover < MIN_COVER) continue;
    const strength = strengthSeen(text, med.strength);
    if (strength === 'other') continue; // a different strength printed: not this one
    const score = best.cover * (strength === 'same' ? 1.5 : 1);
    candidates.push({ medId: med.id, cover: best.cover, word: best.word, strength, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  if (!candidates.length) return { kind: 'none', candidates };
  const [top, second] = candidates;
  if (second && top.score < second.score * MARGIN) return { kind: 'unsure', candidates };
  const med = meds.find((m) => m.id === top.medId)!;
  const hasLookAlike = meds.some((m) => lookAlike(med, m));
  if (top.strength === 'same' && top.cover >= SURE_COVER && !hasLookAlike) return { kind: 'sure', medId: top.medId, candidates };
  return { kind: 'likely', medId: top.medId, candidates };
}
