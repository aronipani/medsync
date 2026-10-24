// Closed-set matching (spec 15): which of THIS household's medicines is this strip, from fragments?
// Used after the strict matcher (match.ts) finds nothing: a worn or cut strip may only show "…LOPIL…" and "75",
// which is enough to tell Clopilet 75 apart from the household's other 2–25 medicines — but never enough to
// accept a look-alike. Pure — no React Native — so it can be unit tested.

import { sameMedicine } from './consolidate.ts';
import { levenshtein, strengthClash, strengthText, tokenize } from './match.ts';
import { relatedNames } from './drugdb.ts';
import { decode, SHARED_PRINT } from './learn.ts';
import type { Medication } from './types.ts';

type Med = Pick<Medication, 'id' | 'name' | 'strength' | 'aliases'> & Partial<Pick<Medication, 'learned' | 'profile'>>;

// Words printed on many strips; they say nothing about which medicine it is.
const COMMON = new Set([
  'TABLET', 'TABLETS', 'TAB', 'TABS', 'CAPSULE', 'CAPSULES', 'CAP', 'CAPS', 'IP', 'BP', 'USP', 'MG', 'MCG', 'ML', 'IU',
  'EACH', 'FILM', 'COATED', 'UNCOATED', 'CONTAINS', 'RELEASE', 'PROLONGED', 'EXTENDED', 'SUSTAINED', 'MODIFIED',
  'STRIP', 'PACK', 'BATCH', 'EXPIRY', 'PHARMA', 'LIMITED', 'LTD', 'HEALTHCARE', 'LABORATORIES', 'SCHEDULE', 'DRUG',
  'STORE', 'PROTECT', 'LIGHT', 'MOISTURE', 'CHILDREN', 'REACH', 'DOSAGE', 'DIRECTED', 'PHYSICIAN', 'INDIA',
  ...SHARED_PRINT,
]);

const MIN_RUN = 4; // fewest letters a fragment must share with a name to count
const MIN_COVER = 0.5; // share of the name's letters that must be seen (across all fragments)
const MARGIN = 1.5; // the best medicine must score this many times the next one
const SURE_COVER = 0.6; // name coverage needed (with strength and no look-alike) for green

/** OCR reads O as 0, I as 1 inside words. */
const letters = (t: string) => t.replace(/0/g, 'O').replace(/1/g, 'I').replace(/5/g, 'S').replace(/8/g, 'B');

/** Name words a person or the medicine list gave: brand, aliases, contents from the built-in list. */
export function primaryWords(med: Med): string[] {
  const generic = med.name ? relatedNames({ name: med.name, strength: med.strength }).generic : undefined;
  const src = [med.name.replace(/\s*\/\s*/g, ' '), ...med.aliases, ...(generic ? [generic] : [])];
  return [...new Set(src.flatMap(tokenize).filter((w) => /^[A-Z]+$/.test(w) && w.length >= MIN_RUN && !COMMON.has(w)))];
}

/**
 * Distinctive name words of a medicine: the primary words above, plus words read from its own strip (strip
 * profile, taught strips). Strip words can include print other medicines share (a maker's name), so a match on
 * them alone gives amber at most (see decide). No numbers, no common print.
 */
export function nameWords(med: Med): string[] {
  const taught = (med.learned ?? []).flatMap(decode).filter((w) => /^[A-Z]{5,}$/.test(w) && !COMMON.has(w));
  const profiled = (med.profile?.words ?? []).filter((w) => /^[A-Z]{4,}$/.test(w) && !COMMON.has(w));
  return [...new Set([...primaryWords(med), ...profiled, ...taught])];
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

/** Every household medicine's name words, for Apple Vision's word list (spec 15, 2a). */
export function householdWords(meds: Med[]): string[] {
  return [...new Set(meds.flatMap(nameWords))];
}

const numbersOf = (s: string) => (s.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);

/** Strength printed: 'same' when the medicine's strength is there, 'other' when only a different mg strength is. */
export function strengthSeen(text: string, strength: string): 'same' | 'other' | 'unknown' {
  const want = numbersOf(strength);
  if (!want.length) return 'unknown';
  const clean = strengthText(text);
  // A strength printed with its unit that disagrees wins over the number turning up elsewhere (review 24 Oct 2026).
  const mgs = [...clean.matchAll(/(\d+(?:\.\d+)?)\s*(mg|mcg|µg|ug)\b/gi)].map((m) => m[1]);
  if (strengthClash(mgs, strength).length) return 'other';
  const nums = tokenize(clean).map((t) => t.replace(/[OQD]/g, '0').replace(/[IL]/g, '1')).filter((t) => /^\d+(\.\d+)?$/.test(t)).map(Number);
  return want.every((n) => nums.includes(n)) ? 'same' : 'unknown';
}

/** Two household medicines that are easy to confuse: same contents, or brand names a letter or two apart. */
export function lookAlike(a: Med, b: Med): boolean {
  if (a.id === b.id) return false;
  if (sameMedicine(a, b)) return true;
  const an = primaryWords({ ...a, aliases: [] });
  const bn = primaryWords({ ...b, aliases: [] });
  return an.some((x) => bn.some((y) => x.slice(0, 4) === y.slice(0, 4) || levenshtein(x, y) <= 2));
}

export interface Candidate {
  medId: string;
  cover: number; // 0…1 of the best-matching name word
  word: string; // which name word
  primary: boolean; // the brand, an alias or the contents name was seen (not only print read from the strip)
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
 *
 * `hints` is text that may point to a household medicine but leans towards household names (Vision's word-list
 * reading, its second-guess readings): it can lift a scan to `likely` (amber), never to `sure` (green), and a
 * hint that points elsewhere than the raw text makes the scan `unsure`.
 */
export function householdMatch(text: string, meds: Med[], hints: string[] = []): Verdict {
  const raw = decide(text, meds);
  if (raw.kind === 'sure' || !hints.length) return raw;
  const withHints = decide(`${text}\n${hints.join('\n')}`, meds);
  if (withHints.kind === 'sure' || withHints.kind === 'likely') {
    if (raw.kind === 'likely' && raw.medId !== withHints.medId) return { kind: 'unsure', candidates: withHints.candidates };
    return { kind: 'likely', medId: withHints.medId, candidates: withHints.candidates };
  }
  return raw.kind === 'none' ? withHints : raw;
}

function decide(text: string, meds: Med[]): Verdict {
  const fragments = [...new Set(tokenize(text).map(letters).filter((t) => /^[A-Z]{4,}$/.test(t) && !COMMON.has(t)))];
  const candidates: Candidate[] = [];
  for (const med of meds) {
    const primary = new Set(primaryWords(med));
    let best = { cover: 0, word: '' };
    let primaryCover = 0;
    let wordsSeen = 0;
    for (const w of nameWords(med)) {
      if (COMMON.has(w)) continue; // older profiles may hold shared print such as SODIUM
      const c = nameCover(fragments, w);
      if (c > best.cover) best = { cover: c, word: w };
      if (primary.has(w)) primaryCover = Math.max(primaryCover, c);
      if (c >= SURE_COVER) wordsSeen++;
    }
    if (best.cover < MIN_COVER) continue;
    const strength = strengthSeen(text, med.strength);
    if (strength === 'other') continue; // a different strength printed: not this one
    // Only words read from its strip (not its brand, alias or contents name) and nothing else to back them up:
    // one word another medicine can share is no evidence. Needs its strength too, or two of its words.
    if (primaryCover < MIN_COVER && strength !== 'same' && wordsSeen < 2) continue;
    const score = best.cover * (strength === 'same' ? 1.5 : 1);
    candidates.push({ medId: med.id, cover: best.cover, word: best.word, primary: primaryCover >= SURE_COVER, strength, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  if (!candidates.length) return { kind: 'none', candidates };
  const [top, second] = candidates;
  if (second && top.score < second.score * MARGIN) return { kind: 'unsure', candidates };
  const med = meds.find((m) => m.id === top.medId)!;
  const hasLookAlike = meds.some((m) => lookAlike(med, m));
  if (top.strength === 'same' && top.cover >= SURE_COVER && top.primary && !hasLookAlike) return { kind: 'sure', medId: top.medId, candidates };
  return { kind: 'likely', medId: top.medId, candidates };
}
