// "Teach this strip": remembers what the phone read from a strip a person confirmed,
// so the same strip is recognised next time even when glare or tearing hides the name.
// Pure — no React Native — so it can be unit tested.

const MAX_PER_MED = 8;

// Lines that are the same on many different medicines (maker, address, warnings, storage, price, batch).
const SKIP_LINE =
  /\b(ltd|limited|pvt|pharma|pharmaceuticals?|laborator(y|ies)|labs?|healthcare|life\s?sciences|remedies|drugs?|manufactured|marketed|mfd|mfg|lic|m\.?\s?l\.?|road|rd|dist|district|vill|village|p\.?\s?o\.?|nagar|sector|plot|phase|industrial|estate|assam|sikkim|gujarat|maharashtra|himachal|uttarakhand|goa|mumbai|india|caution|schedule|prescription|retail|sold|practitioner|registered|trade\s?mark|store|storage|temperature|protect|light|moisture|children|reach|dosage|dose|directed|physician|specialist|keep|warning|exp|expiry|batch|b\.?\s?no|m\.?\s?r\.?\s?p|price|rs|₹|incl|taxes|per|pack|blister|excipients?|colou?rs?|oxide|dioxide|lake|tartrazine|q\.?\s?s)\b/i;

const STOP_WORDS = new Set([
  'TABLET', 'TABLETS', 'TAB', 'TABS', 'CAPSULE', 'CAPSULES', 'CAP', 'IP', 'BP', 'USP', 'NF', 'EACH', 'CONTAINS', 'CONTAIN',
  'FILM', 'COATED', 'UNCOATED', 'EQUIVALENT', 'TO', 'AND', 'OF', 'THE', 'FOR', 'WITH', 'MG', 'MCG', 'ML', 'IU', 'GM',
  'DILUTED', 'RELEASE', 'PROLONGED', 'EXTENDED', 'SUSTAINED', 'MODIFIED', 'ORAL', 'COMPOSITION', 'RX', 'MON', 'TUE',
  'WED', 'THU', 'FRI', 'SAT', 'SUN', 'NOT',
]);

/** Words and small numbers that identify this strip, from its brand and composition lines only. */
export function fingerprint(lines: string[]): string[] {
  const out = new Set<string>();
  for (const line of lines) {
    if (SKIP_LINE.test(line)) continue;
    for (const raw of line.toUpperCase().replace(/[®™©Ⓡ]/g, ' ').split(/[^A-Z0-9.]+/)) {
      const t = raw.replace(/^\.+|\.+$/g, '');
      if (!t || STOP_WORDS.has(t)) continue;
      const isWord = /^[A-Z]{3,}$/.test(t);
      const isStrength = /^\d{1,4}(\.\d{1,3})?$/.test(t) && !/^0\d/.test(t); // 10, 2.5, 650 — not batch or MRP numbers
      if (isWord || isStrength) out.add(t);
    }
  }
  return [...out].sort();
}

export const encode = (fp: string[]) => fp.join(' ');
export const decode = (s: string) => s.split(' ').filter(Boolean);

/** Adds a fingerprint to a medicine's learned list (newest kept, near-duplicates skipped). */
export function addLearned(existing: string[] | undefined, fp: string[]): string[] {
  const list = existing ?? [];
  if (fp.length < 2) return list;
  const enc = encode(fp);
  const near = list.some((l) => {
    const a = new Set(decode(l));
    const shared = fp.filter((t) => a.has(t)).length;
    return shared / Math.max(a.size, fp.length) > 0.9;
  });
  return near ? list : [...list, enc].slice(-MAX_PER_MED);
}

export interface LearnedHit {
  medId: string;
  score: number; // share of the learned strip's own words found in this scan
  shared: string[];
}

/**
 * Which taught medicine (if any) this scan looks like. A word only counts if no OTHER medicine's
 * taught strips contain it — so two strips from the same company can't be confused through shared print.
 * Needs at least 3 such words, including at least one word (not only numbers), and most of the strip.
 */
export function bestLearned(scanLines: string[], meds: { id: string; learned?: string[] }[]): LearnedHit | undefined {
  const scan = new Set(fingerprint(scanLines));
  if (scan.size < 3) return undefined;
  const tokensOf = new Map(meds.map((m) => [m.id, new Set((m.learned ?? []).flatMap(decode))]));
  let best: LearnedHit | undefined;
  for (const m of meds) {
    if (!m.learned?.length) continue;
    const others = new Set(meds.filter((o) => o.id !== m.id).flatMap((o) => [...(tokensOf.get(o.id) ?? [])]));
    for (const l of m.learned) {
      const own = decode(l).filter((t) => !others.has(t));
      if (own.length < 3) continue;
      const shared = own.filter((t) => scan.has(t));
      const score = shared.length / own.length;
      const hasWord = shared.some((t) => /[A-Z]/.test(t));
      if (shared.length >= 3 && hasWord && score >= 0.6 && (!best || score > best.score)) best = { medId: m.id, score, shared };
    }
  }
  return best;
}
