// The US medicine list (FDA NDC Directory, public domain), kept apart from the Indian / hand-checked list.
// Pure — used by scripts/build-us-medicine-list.ts, the scan screens and tests. See docs/specs/18-us-medicine-list.md.
//
// Isolation: this list is looked up only by NDC (from a US box's barcode or its printed "NDC 0781-7296-85"). An NDC
// belongs to exactly one US product, so it can't be confused with an Indian brand name. Nothing here is added to
// the brand index in drugdb.ts.

export type UsProduct = [name: string, contents: string, strength: string, unit: string, labeler: number];

export interface UsList {
  format: 1;
  source: string;
  built: string; // YYYY-MM-DD
  labelers: string[];
  products: UsProduct[];
  /** Sorted fixed-width records: 10-digit package NDC + product index in base 36 (4 chars). */
  ndc: string;
}

export interface UsMedicine {
  ndc: string; // "0781-7296-85" style is not kept; 10 digits
  name: string; // "Albuterol", "ProAir HFA"
  contents: string; // "Albuterol"
  strength: string; // "90 mcg"
  unit: string; // puff, tablet, capsule, ml, drops, injection, sachet
  maker: string;
}

const REC = 14;

// ---------- Codes ----------

/**
 * The 10-digit NDCs a scanned code or printed text could stand for.
 * - UPC-A on a US box: "3" + NDC10 + check digit; as GTIN-14 (also the GS1 DataMatrix): "003" + NDC10 + check.
 * - Printed: "NDC 0781-7296-85" (10 digits) or the 11-digit "00781-7296-85" (one segment padded with a 0;
 *   which one isn't known, so each is tried).
 */
export function ndcCandidates(raw: string): string[] {
  const out: string[] = [];
  const s = raw.trim().replace(/[\u001d\s]/g, '');
  const gs1 = /\(01\)(\d{14})/.exec(s) ?? (s.length > 16 ? /^01(\d{14})/.exec(s) : null);
  const digits = gs1 ? gs1[1] : /^\d{12,14}$/.test(s) ? s.padStart(14, '0') : '';
  if (digits.startsWith('003')) out.push(digits.slice(3, 13));
  for (const m of raw.matchAll(/\bNDC\s*(?:No\.?|#|:)?\s*(\d{4,5})\s*-\s*(\d{3,4})\s*-\s*(\d{1,2})\b/gi)) {
    const [a, b, c] = [m[1], m[2], m[3]];
    const all = a + b + c;
    if (all.length === 10) out.push(all);
    else if (all.length === 11) {
      if (a.length === 5 && a[0] === '0') out.push(a.slice(1) + b + c);
      if (b.length === 4 && b[0] === '0') out.push(a + b.slice(1) + c);
      if (c.length === 2 && c[0] === '0') out.push(a + b + c.slice(1));
    }
  }
  return [...new Set(out)];
}

/** Finds a product by a scanned code or by text that prints its NDC. */
export function lookupUs(list: UsList, raw: string): UsMedicine | undefined {
  for (const ndc of ndcCandidates(raw)) {
    const i = findRecord(list.ndc, ndc);
    if (i < 0) continue;
    const p = list.products[parseInt(list.ndc.slice(i + 10, i + REC), 36)];
    if (!p) continue;
    return { ndc, name: p[0], contents: p[1], strength: p[2], unit: p[3], maker: list.labelers[p[4]] ?? '' };
  }
  return undefined;
}

function findRecord(table: string, ndc: string): number {
  let lo = 0;
  let hi = table.length / REC - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const key = table.slice(mid * REC, mid * REC + 10);
    if (key === ndc) return mid * REC;
    if (key < ndc) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

/** What a product looks like as printed text, so the normal name-and-strength check can be run on it. */
export function usText(m: UsMedicine): string {
  return [m.name, m.contents, m.strength].filter(Boolean).join('\n');
}

// ---------- Building (from the FDA's product.txt and package.txt) ----------

export interface UsBuildStats {
  products: number;
  packages: number;
  kept: { products: number; packages: number };
  skipped: { type: number; otcRoute: number; ended: number; excluded: number; noStrength: number; sample: number; noProduct: number };
}

const PRODUCT_COLS = ['PRODUCTID', 'PRODUCTNDC', 'PRODUCTTYPENAME', 'PROPRIETARYNAME', 'NONPROPRIETARYNAME', 'DOSAGEFORMNAME', 'ROUTENAME', 'LABELERNAME', 'SUBSTANCENAME', 'ACTIVE_NUMERATOR_STRENGTH', 'ACTIVE_INGRED_UNIT'];
const PACKAGE_COLS = ['PRODUCTID', 'NDCPACKAGECODE'];

/** Tab-separated FDA file → rows by header name. Throws when an expected column is missing (the FDA changed the format). */
export function parseTsv(text: string, required: string[]): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const head = (lines.shift() ?? '').split('\t').map((h) => h.trim().toUpperCase());
  const missing = required.filter((c) => !head.includes(c));
  if (missing.length) throw new Error(`FDA file is missing columns: ${missing.join(', ')} (has: ${head.join(', ')})`);
  return lines.map((l) => {
    const f = l.split('\t');
    return Object.fromEntries(head.map((h, i) => [h, (f[i] ?? '').trim()]));
  });
}

// Over-the-counter products taken by mouth, breathed in, or put in the eye or nose. Sunscreens, hand gels,
// toothpastes and skin creams (most of the OTC listings) are left out.
const OTC_ROUTES = /\b(ORAL|SUBLINGUAL|BUCCAL|RESPIRATORY|INHALATION|NASAL|OPHTHALMIC)\b/;
const SALTS =
  /\b(hydrochloride|hcl|bisulphate|bisulfate|besylate|besilate|maleate|tartrate|succinate|sodium|potassium|calcium|magnesium|dihydrate|monohydrate|trihydrate|hydrobromide|mesylate|fumarate|citrate|phosphate|sulphate|sulfate|acetate|anhydrous)\b/gi;

const title = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\s+/g, ' ').trim();
/** FDA names are often in capitals; mixed case ("ProAir HFA") is kept as printed. */
const asPrinted = (s: string) => (s === s.toUpperCase() ? title(s).replace(/\b(Hfa|Er|Xr|Sr|Xl|Dr|Cr|Odt|Hct)\b/g, (w) => w.toUpperCase()) : s.replace(/\s+/g, ' ').trim());
const plain = (s: string) => title(s.replace(SALTS, ' ').replace(/[^A-Za-z ,;-]/g, ' '));
const norm = (s: string) => s.toLowerCase().replace(SALTS, ' ').replace(/[^a-z]/g, '');

export function unitFor(form: string, route: string): string {
  const f = form.toUpperCase();
  if (/AEROSOL|INHALANT|INHALATION|METERED/.test(f) || (/POWDER/.test(f) && /RESPIRATORY|INHALATION/.test(route))) return 'puff';
  if (/TABLET|LOZENGE|TROCHE/.test(f)) return 'tablet';
  if (/CAPSULE/.test(f)) return 'capsule';
  if (/INJECT|INFUSION/.test(f) || /INTRAVENOUS|SUBCUTANEOUS|INTRAMUSCULAR/.test(route)) return 'injection';
  if (/DROP/.test(f) || /OPHTHALMIC|OTIC/.test(route)) return 'drops';
  if (/SPRAY/.test(f) && /NASAL/.test(route)) return 'puff';
  if (/SOLUTION|SUSPENSION|SYRUP|ELIXIR|LIQUID|EMULSION/.test(f)) return 'ml';
  if (/POWDER|GRANULE/.test(f)) return 'sachet';
  return 'tablet';
}

/** "90" + "ug/1" → "90 mcg"; "5; 10" + "mg/1; mg/1" → "5/10 mg"; "100" + "mg/5mL" → "100 mg/5 mL". */
export function strengthFor(nums: string, units: string): string {
  const n = nums.split(';').map((x) => x.trim()).filter(Boolean);
  const u = units.split(';').map((x) => x.trim());
  if (!n.length) return '';
  const unit = (x: string) => {
    const [top, per] = (x || '').split('/');
    const t = (top ?? '').replace(/^ug$/i, 'mcg').replace(/^g$/i, 'g').replace(/^\[iU\]$/i, 'IU').trim();
    const p = (per ?? '').trim();
    return !p || p === '1' ? t : `${t}/${p.replace(/^(\d+(?:\.\d+)?)\s*mL$/i, '$1 mL').replace(/^mL$/i, 'mL')}`;
  };
  const units1 = n.map((_, i) => unit(u[i] ?? u[0] ?? ''));
  const num = (x: string) => x.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  if (units1.every((x) => x === units1[0])) return `${n.map(num).join('/')} ${units1[0]}`.trim();
  return n.map((x, i) => `${num(x)} ${units1[i]}`.trim()).join(' + ');
}

export function buildUsList(productTsv: string, packageTsv: string, source: string, built: string): { list: UsList; stats: UsBuildStats } {
  const today = built.replace(/-/g, '');
  const products = parseTsv(productTsv, PRODUCT_COLS);
  const packages = parseTsv(packageTsv, PACKAGE_COLS);
  const stats: UsBuildStats = {
    products: products.length,
    packages: packages.length,
    kept: { products: 0, packages: 0 },
    skipped: { type: 0, otcRoute: 0, ended: 0, excluded: 0, noStrength: 0, sample: 0, noProduct: 0 },
  };
  const ended = (d?: string) => !!d && /^\d{8}$/.test(d) && d < today;
  const labelers: string[] = [];
  const labelerIdx = new Map<string, number>();
  const outProducts: UsProduct[] = [];
  const productKey = new Map<string, number>(); // same tuple → one entry
  const byId = new Map<string, number>();
  for (const r of products) {
    const type = r.PRODUCTTYPENAME.toUpperCase();
    if (type !== 'HUMAN PRESCRIPTION DRUG' && type !== 'HUMAN OTC DRUG') {
      stats.skipped.type++;
      continue;
    }
    if (type === 'HUMAN OTC DRUG' && !OTC_ROUTES.test(r.ROUTENAME.toUpperCase())) {
      stats.skipped.otcRoute++;
      continue;
    }
    if (ended(r.ENDMARKETINGDATE)) {
      stats.skipped.ended++;
      continue;
    }
    if ((r.NDC_EXCLUDE_FLAG ?? '').toUpperCase() === 'Y') {
      stats.skipped.excluded++;
      continue;
    }
    const strength = strengthFor(r.ACTIVE_NUMERATOR_STRENGTH, r.ACTIVE_INGRED_UNIT);
    if (!strength) {
      stats.skipped.noStrength++;
      continue;
    }
    const contents = (r.SUBSTANCENAME || r.NONPROPRIETARYNAME)
      .split(/\s*;\s*|\s*,\s*|\s+and\s+/i)
      .map(plain)
      .filter(Boolean)
      .join(' + ');
    const brandRaw = [r.PROPRIETARYNAME, r.PROPRIETARYNAMESUFFIX].filter(Boolean).join(' ');
    // A generic product's "proprietary name" is its contents ("Albuterol Sulfate"): it's named as people say it ("Albuterol").
    const generic = !brandRaw || norm(brandRaw) === norm(r.NONPROPRIETARYNAME) || norm(brandRaw) === norm(contents.replace(/\+/g, ''));
    const name = generic ? contents : asPrinted(brandRaw);
    const unit = unitFor(r.DOSAGEFORMNAME, r.ROUTENAME.toUpperCase());
    const maker = asPrinted(r.LABELERNAME);
    let li = labelerIdx.get(maker);
    if (li === undefined) labelerIdx.set(maker, (li = labelers.push(maker) - 1));
    const tuple: UsProduct = [name, contents, strength, unit, li];
    const key = tuple.join('|');
    let pi = productKey.get(key);
    if (pi === undefined) productKey.set(key, (pi = outProducts.push(tuple) - 1));
    byId.set(r.PRODUCTID, pi);
  }
  const records = new Map<string, number>();
  for (const r of packages) {
    if ((r.SAMPLE_PACKAGE ?? '').toUpperCase() === 'Y') {
      stats.skipped.sample++;
      continue;
    }
    if ((r.NDC_EXCLUDE_FLAG ?? '').toUpperCase() === 'Y' || ended(r.ENDMARKETINGDATE)) {
      stats.skipped.ended++;
      continue;
    }
    const pi = byId.get(r.PRODUCTID);
    if (pi === undefined) {
      stats.skipped.noProduct++;
      continue;
    }
    const ndc = r.NDCPACKAGECODE.replace(/\D/g, '');
    if (ndc.length !== 10 || pi >= 36 ** 4) continue;
    records.set(ndc, pi);
  }
  // Only products that have a package left are kept, renumbered in order.
  const used = [...new Set(records.values())].sort((a, b) => a - b);
  const renum = new Map(used.map((old, i) => [old, i]));
  const kept = used.map((i) => outProducts[i]);
  stats.kept.products = kept.length;
  stats.kept.packages = records.size;
  const ndc = [...records.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([code, pi]) => code + (renum.get(pi) ?? 0).toString(36).padStart(4, '0'))
    .join('');
  return { list: { format: 1, source, built, labelers, products: kept, ndc }, stats };
}
