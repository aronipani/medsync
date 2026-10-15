// Turns a large medicine dataset (brand name + composition rows) into the app's compact list.
// Pure — used by scripts/build-medicine-list.ts and tests. See docs/specs/04-offline-medicine-list.md.

export type CompactEntry = [ingredients: string[], strengths: string[], brands: string[]];

export interface CompactList {
  format: 1;
  source: string;
  built: string;
  entries: CompactEntry[];
}

export interface BuildStats {
  rows: number;
  entries: number;
  brands: number;
  skipped: { noContents: number; shortName: number; commonWord: number; ambiguous: number; handChecked: number; filtered: number };
}

const FORM_WORDS =
  /\b(tablets?|tab|capsules?|cap|syrup|suspension|injection|inj|drops?|cream|gel|ointment|lotion|sachets?|powder|solution|spray|inhaler|respules|strip|bottle|vial|tube|of|ml|mg|mcg|gm|g|iu)\b.*$/i;

/** "Telma-H 40 Tablet" → "Telma-H"; "Dolo 650 Tablet" → "Dolo"; "Ecosprin-AV 75 Capsule" → "Ecosprin-AV". */
export function cleanBrand(name: string): string {
  let s = name.replace(/[®™]/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/\s+\d[\d.,/]*\s*(mg|mcg|ml|gm|g|iu|%)?\b.*$/i, ''); // from the first strength onwards
  s = s.replace(new RegExp(`\\s+${FORM_WORDS.source}`, 'i'), '');
  return s.replace(/[\s-]+$/, '').trim();
}

/** "Telmisartan (40mg) + Hydrochlorothiazide (12.5mg)" → ingredients and "40/12.5". */
export function parseComposition(text: string): { ingredients: string[]; strength: string } | undefined {
  const parts = text
    .split(/\s*\+\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return undefined;
  const ingredients: string[] = [];
  const amounts: string[] = [];
  for (const p of parts) {
    const m = p.match(/^(.*?)\s*\(\s*([\d.]+)\s*(mg|mcg|µg|g|gm|iu|%|ml)?[^)]*\)\s*$/i);
    const name = (m ? m[1] : p.replace(/\s*[\d.]+\s*(mg|mcg|µg|g|iu|%)\b.*$/i, '')).replace(/\s+/g, ' ').trim();
    if (!/[a-z]{3}/i.test(name)) return undefined;
    ingredients.push(titleCase(name));
    if (m) amounts.push(m[2]);
  }
  return { ingredients, strength: amounts.length === ingredients.length ? amounts.join('/') : '' };
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Brand names that are ordinary words would match random text on a strip. */
export const COMMON_WORDS = new Set(
  'relief calm store cool care cure fast free fresh gold life lite plus pure rest safe star sure well zero clear active total smart power energy happy health natural instant comfort balance strong super prime ultra calcium vitamin iron zinc tablet tablets capsule syrup drops cream gel oil'
    .split(' '),
);

/**
 * Builds the compact list. `handChecked` brands (normalized) are left to the hand-checked list.
 * Rows: { name, composition, skip? }.
 */
export function compile(rows: { name: string; composition: string; skip?: boolean }[], handChecked: Set<string>, source: string, built: string): { list: CompactList; stats: BuildStats } {
  const stats: BuildStats = { rows: rows.length, entries: 0, brands: 0, skipped: { noContents: 0, shortName: 0, commonWord: 0, ambiguous: 0, handChecked: 0, filtered: 0 } };
  const byBrand = new Map<string, { brand: string; key: string; ingredients: string[]; strengths: Set<string> } | null>(); // null = ambiguous
  for (const r of rows) {
    if (r.skip) {
      stats.skipped.filtered++;
      continue;
    }
    const c = parseComposition(r.composition ?? '');
    if (!c) {
      stats.skipped.noContents++;
      continue;
    }
    const brand = cleanBrand(r.name ?? '');
    const nb = norm(brand);
    if (nb.replace(/\d/g, '').length < 4) {
      stats.skipped.shortName++;
      continue;
    }
    if (COMMON_WORDS.has(nb)) {
      stats.skipped.commonWord++;
      continue;
    }
    if (handChecked.has(nb)) {
      stats.skipped.handChecked++;
      continue;
    }
    const key = c.ingredients.map(norm).join('+');
    const prev = byBrand.get(nb);
    if (prev === null) continue;
    if (prev && prev.key !== key) {
      byBrand.set(nb, null);
      stats.skipped.ambiguous++;
      continue;
    }
    const e = prev ?? { brand, key, ingredients: c.ingredients, strengths: new Set<string>() };
    if (c.strength) e.strengths.add(c.strength);
    byBrand.set(nb, e);
  }
  const groups = new Map<string, CompactEntry>();
  for (const e of byBrand.values()) {
    if (!e) continue;
    const g = groups.get(e.key) ?? [e.ingredients, [], []];
    for (const s of e.strengths) if (!g[1].includes(s)) g[1].push(s);
    g[2].push(e.brand);
    groups.set(e.key, g);
    stats.brands++;
  }
  const entries = [...groups.values()].map(([i, s, b]) => [i, s.sort((x, y) => parseFloat(x) - parseFloat(y)), b.sort()] as CompactEntry);
  entries.sort((a, b) => a[0].join('+').localeCompare(b[0].join('+')));
  stats.entries = entries.length;
  return { list: { format: 1, source, built, entries }, stats };
}

/** Minimal CSV reader (quoted fields, commas and newlines inside quotes). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') (field += '"'), i++;
      else if (ch === '"') q = false;
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') row.push(field), (field = '');
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) row.push(field), rows.push(row);
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}
