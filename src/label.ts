// Turns OCR text from a strip, bottle or box into a medicine draft (name, strength, form, generic).
// Pure — no React Native imports — so it can be unit tested.

export interface OcrLine {
  text: string;
  height?: number; // text height in pixels, when known; bigger = more prominent (usually the brand)
  top?: number;
  left?: number;
}

/**
 * Text recognisers split a table row ("Tab Dolo 650 | 1-0-1 | after food") into separate pieces.
 * This puts pieces on the same visual row back together, left to right, and orders rows top to bottom.
 */
export function mergeRows(lines: OcrLine[]): string[] {
  if (lines.some((l) => l.top === undefined || l.height === undefined)) return lines.map((l) => l.text);
  const sorted = [...lines].sort((a, b) => a.top! - b.top!);
  const rows: OcrLine[][] = [];
  for (const l of sorted) {
    const mid = l.top! + l.height! / 2;
    const row = rows.find((r) => {
      const ref = r[0];
      return Math.abs(ref.top! + ref.height! / 2 - mid) < Math.min(ref.height!, l.height!) * 0.6;
    });
    if (row) row.push(l);
    else rows.push([l]);
  }
  return rows.map((r) => r.sort((a, b) => (a.left ?? 0) - (b.left ?? 0)).map((l) => l.text).join('   '));
}

export interface MedDraft {
  name: string;
  strength: string;
  unit: string;
  aliases: string[];
  barcodes: string[];
}

export interface LabelResult extends MedDraft {
  nameOptions: string[]; // other likely brand names, for the user to pick from
}

const FORM_WORDS: [RegExp, string][] = [
  [/\b(tablets?|tab)\b/i, 'tablet'],
  [/\b(capsules?|cap|softgels?)\b/i, 'capsule'],
  [/\b(syrup|suspension|oral solution|liquid|elixir)\b/i, 'ml'],
  [/\b(drops?|eye drops|ear drops)\b/i, 'drops'],
  [/\b(inhaler|rotacaps?|respules?)\b/i, 'puff'],
  [/\b(injection|vial|ampoule)\b/i, 'injection'],
  [/\b(sachets?|granules|powder)\b/i, 'sachet'],
];

const NOISE =
  /\b(tablets?|capsules?|ip|bp|usp|each|contains?|film|coated|mfd|mfg|manufactured|marketed|ltd|limited|pvt|private|batch|b\.?\s?no|lot|exp|expiry|rx|schedule|warning|store|keep|reach|children|price|mrp|rs|incl|taxes|dosage|composition|pharma|pharmaceuticals?|labs?|laboratories|healthcare|lifesciences|india|directed|physician|prescription|only|retail|sale|protect|light|moisture|temperature|below|use|before|tablet|strip|reg|lic|no|dr|uses?|syrup|suspension|drops?|injection|inhaler|sachets?|oral|solution)\b/gi;

const STRENGTH = /(\d+(?:\.\d+)?)\s*(mg|mcg|µg|ug|ml|gm|g|iu|k)\b/i;
const BARE_NUM = /\b(\d{1,4}(?:\.\d+)?)\b/;

export function formatStrength(num: string, unit?: string): string {
  const u = (unit ?? '').toLowerCase();
  if (!u || u === 'mg') return num;
  if (u === 'k') return `${num}K`;
  if (u === 'µg' || u === 'ug') return `${num} mcg`;
  if (u === 'iu') return `${num} IU`;
  return `${num} ${u}`;
}

export function detectForm(text: string): string | undefined {
  for (const [re, unit] of FORM_WORDS) if (re.test(text)) return unit;
  return undefined;
}

const titleCase = (s: string) =>
  s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length <= 2 && /[a-z]/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');

/** Generic composition, e.g. "Paracetamol Tablets IP 650 mg" or "Each tablet contains: Telmisartan IP 40 mg". */
function findGenerics(text: string): string[] {
  const out: string[] = [];
  const res = [
    /([A-Za-z][A-Za-z ]{3,40}?)[ \t]+(?:tablets?|capsules?|oral suspension|syrup|injection)[ \t]*(?:ip|bp|usp)?[ \t]*(\d+(?:\.\d+)?)[ \t]*(mg|mcg|iu)\b/gi,
    /contains[ \t]*:?[ \t]*([A-Za-z][A-Za-z ]{3,40}?)[ \t]*(?:ip|bp|usp)?[ \t]+(\d+(?:\.\d+)?)[ \t]*(mg|mcg|iu)\b/gi,
  ];
  for (const re of res) {
    for (const m of text.matchAll(re)) {
      const generic = m[1].replace(NOISE, ' ').replace(/\s+/g, ' ').trim();
      if (generic.length >= 4) out.push(`${titleCase(generic)} ${formatStrength(m[2], m[3])}`);
    }
  }
  return [...new Set(out)];
}

/** "DOLO-650" -> { name: "Dolo", strength: "650" } */
function splitBrand(line: string): { name: string; strength?: string } | undefined {
  const cleaned = line.replace(/[®™©]/g, ' ').replace(NOISE, ' ').replace(/[^A-Za-z0-9.\- ]/g, ' ');
  const m = /^\s*([A-Za-z][A-Za-z\-]*(?:\s+[A-Za-z][A-Za-z\-]*){0,2})[\s-]*(\d+(?:\.\d+)?\s*(?:mg|mcg|ml|iu|k)?)?/i.exec(cleaned);
  if (!m) return undefined;
  const name = m[1].replace(/-+$/, '').replace(/-/g, ' ').trim();
  if (name.replace(/\s/g, '').length < 3) return undefined;
  let strength: string | undefined;
  if (m[2]) {
    const s = STRENGTH.exec(m[2]) ?? BARE_NUM.exec(m[2]);
    if (s) strength = formatStrength(s[1], s[2]);
  }
  return { name: titleCase(name), strength };
}

export function parseLabel(lines: OcrLine[], barcode?: string): LabelResult {
  const text = lines.map((l) => l.text).join('\n');
  const unit = detectForm(text) ?? 'tablet';
  const generics = findGenerics(text);

  // Most prominent lines first (bigger text); keep OCR order when sizes are unknown.
  const ranked = lines
    .map((l, i) => ({ ...l, i }))
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0) || a.i - b.i);

  const genericNames = new Set(generics.map((g) => g.split(' ')[0].toLowerCase()));
  const options: { name: string; strength?: string }[] = [];
  for (const l of ranked) {
    if (l.text.length > 40) continue;
    const b = splitBrand(l.text);
    if (!b) continue;
    if (options.some((o) => o.name.toLowerCase() === b.name.toLowerCase())) continue;
    options.push(b);
    if (options.length >= 5) break;
  }
  // Prefer a brand that isn't just the generic name, when one exists.
  const brand = options.find((o) => !genericNames.has(o.name.split(' ')[0].toLowerCase())) ?? options[0];

  let strength = brand?.strength;
  if (!strength) {
    // For liquids the only number is often the bottle size (100 ml) — not a strength.
    const s = unit === 'ml' ? null : STRENGTH.exec(text);
    if (s) strength = formatStrength(s[1], s[2]);
  }

  const barcodes = barcode ? [barcode] : [];
  return {
    name: brand?.name ?? '',
    strength: strength ?? '',
    unit,
    aliases: generics.filter((g) => !brand || !g.toLowerCase().startsWith(brand.name.toLowerCase())).slice(0, 2),
    barcodes,
    nameOptions: options.map((o) => o.name),
  };
}
