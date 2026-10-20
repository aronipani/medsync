// Turns OCR text from a strip, bottle or box into a medicine draft (name, strength, form, generic).
// Pure — no React Native imports — so it can be unit tested.

import { ALL_DRUGS, lookupBrand, lookupIngredients } from './drugdb.ts';

export interface OcrLine {
  text: string;
  height?: number; // text height in pixels, when known; bigger = more prominent (usually the brand)
  top?: number;
  left?: number;
  width?: number;
  corners?: { x: number; y: number }[]; // the line's four corners when the reader gives them (tilted text)
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
      return Math.abs(ref.top! + ref.height! / 2 - mid) < Math.min(ref.height!, l.height!) * 0.75; // a little slack for curled or tilted paper
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

export interface Ingredient {
  name: string; // e.g. "Clopidogrel"
  strength?: string; // e.g. "75" or "50 mcg"
}

export interface LabelResult extends MedDraft {
  ingredients: Ingredient[]; // what the medicine is, read first from the strip
  contents: string; // human-readable, e.g. "Bempedoic Acid 180 mg + Ezetimibe 10 mg"
  brand?: string; // brand name, if one was found
  nameOptions: string[]; // other likely names for the user to pick from
}

const FORM_WORDS: [RegExp, string][] = [
  // Inhalers first: a box says "Inhalation Aerosol", "200 metered actuations", "HFA" — never "tablet".
  [/\b(inhalers?|inhalation|inhalation\s+aerosol|metered\s+(dose|actuations?|inhalations?)|actuations?|puffs?|hfa|mdi|rotacaps?|respules?)\b/i, 'puff'],
  [/\b(tablets?|tab)\b/i, 'tablet'],
  [/\b(capsules?|cap|softgels?)\b/i, 'capsule'],
  [/\b(syrup|suspension|oral solution|liquid|elixir)\b/i, 'ml'],
  [/\b(drops?|eye drops|ear drops)\b/i, 'drops'],
  [/\b(injection|vial|ampoule)\b/i, 'injection'],
  [/\b(sachets?|granules|powder)\b/i, 'sachet'],
];

// Salt names are dropped so the medicine reads as people say it ("Clopidogrel", not "Clopidogrel Bisulphate").
const SALTS =
  /\b(hydrochloride|hcl|bisulphate|bisulfate|besylate|besilate|maleate|tartrate|succinate|sodium|potassium|calcium|magnesium|dihydrate|monohydrate|trihydrate|hydrobromide|mesylate|fumarate|citrate|phosphate|sulphate|sulfate|acetate)\b/gi;
const PHARMACOPOEIA = /\b(i\.?\s?p\.?|b\.?\s?p\.?|u\.?\s?s\.?\s?p\.?(?:-?\s?nf)?|ph\.?\s?eur\.?)(?=\s|$|[^a-z])/gi;
const NOT_INGREDIENT =
  /\b(excipients?|colou?rs?|oxide|dioxide|lake|q\.?s|each|contains?|composition|mrp|m\.r\.p|rs|price|per|pack|tabs?|tablets?|capsules?|store|storage|below|dosage|dose|directed|physician|batch|exp|mfg|mfd|lic|reg|schedule|caution|warning)\b/i;
const EXCIPIENT = /\b(oxide|dioxide|lake|excipients?|colou?rs?|titanium|iron|sucrose|lactose|starch|q\.\s?s)\b/i;
const WARNING_BOX = /\b(caution|schedule\s*h|prescription|registered|trade\s*mark|sold|retail|practitioner|drug)\b/i;
// Box print that is never the name: pack size, code numbers and propellant notes on inhaler and US boxes
// ("Net Contents 6.7 g", "NDC 0781-7296-85", "200 Metered Inhalations", "Contains no chlorofluorocarbons").
const PACKAGING = /\b(net\s*(contents?|wt\.?|weight|qty|quantity|vol(ume)?)|contents?|ndc|metered|inhalations?|actuations?|chlorofluorocarbons?|cfcs?|indicator|actuator|propellant)\b/i;
const COMPANY = /\b(sandoz|teva|mylan|viatris|cipla|lupin|glenmark|zydus|cadila|torrent|alkem|mankind|pfizer|gsk|glaxosmithkline|novartis|sanofi|abbott|pharma|pharmaceuticals?|labs?|laboratories|ltd|limited|pvt|healthcare|life\s?sciences|remedies|drugs|industries|marketed|manufactured)\b/i;
const NOISE =
  /\b(tablets?|capsules?|ip|i\.p|bp|usp|each|contains?|film|coated|uncoated|mfd|mfg|manufactured|marketed|ltd|limited|pvt|private|batch|b\.?\s?no|lot|exp|expiry|rx|schedule|warning|caution|store|keep|reach|children|price|mrp|rs|incl|inclusive|taxes|dosage|dose|composition|pharma|pharmaceuticals?|labs?|laboratories|healthcare|lifesciences|india|directed|physician|prescription|only|retail|sale|sold|protect|protected|light|moisture|temperature|below|use|before|tablet|strip|reg|lic|no|dr|uses?|syrup|suspension|drops?|injection|inhaler|sachets?|oral|solution|registered|trade\s?mark|mon|tue|wed|thu|fri|sat|sun|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|blister|equivalent|to|storage|excipients?|colou?r)\b/gi;

const STRENGTH = /(\d+(?:\.\d+)?)\s*(mg|mcg|µg|ug|ml|gm|g|iu|k)\b/i;

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
    .filter(Boolean)
    .map((w) => (w.length <= 2 && /[a-z]/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');

function cleanIngredient(raw: string): string {
  return titleCase(
    raw
      .replace(PHARMACOPOEIA, ' ')
      .replace(SALTS, ' ')
      .replace(/[^A-Za-z ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function editDistance(a: string, b: string): number {
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

/** Same ingredient despite OCR slips ("Bampedoic" vs "Bempedoic")? Compares first words. */
const sameIngredient = (a: string, b: string) => {
  const x = a.split(' ')[0].toLowerCase();
  const y = b.split(' ')[0].toLowerCase();
  return x === y || (x.length >= 5 && y.length >= 5 && editDistance(x, y) <= 2);
};

/**
 * A torn or covered piece of a longer name: "Mononitrate" or "bide Mononitrate" of "Isosorbide Mononitrate".
 * The short name's words must be the last words of the long one (its first word may be cut at the start).
 */
function fragmentOf(short: string, long: string): boolean {
  const a = short.toLowerCase().split(' ').filter(Boolean);
  const b = long.toLowerCase().split(' ').filter(Boolean);
  if (!a.length || a.length > b.length || short.length >= long.length) return false;
  const tail = b.slice(b.length - a.length);
  return a.every((w, i) => (i === 0 ? tail[0].endsWith(w) : tail[i] === w));
}

/** Drops ingredient names that are only pieces of another one, keeping the strength if only the piece had it. */
function dropFragments(list: Ingredient[]): Ingredient[] {
  const out: Ingredient[] = [];
  for (const x of list) {
    if (list.some((y) => y !== x && fragmentOf(x.name, y.name))) continue;
    const strength = x.strength ?? list.find((y) => y !== x && fragmentOf(y.name, x.name) && y.strength)?.strength;
    out.push(strength ? { name: x.name, strength } : { name: x.name });
  }
  return out;
}

/** "Cilnidipine & Telmisartan Tablets" / "Nebivolol Hydrochloride Tablets I.P." -> ingredient names. */
function headerIngredients(lines: string[]): string[] {
  for (let i = 0; i < lines.length; i++) {
    const m = /^(.*?)\s*\b(tablets?|capsules?|oral suspension|syrup|injection|eye drops|drops)\b/i.exec(lines[i]);
    if (!m) continue;
    let head = m[1].replace(/^(rx|℞)\s*/i, '').trim();
    if (/\d/.test(head) || NOT_INGREDIENT.test(head) || COMPANY.test(head)) continue;
    // Name split over two lines: "Nebivolol" / "Hydrochloride Tablets I.P."
    if (!cleanIngredient(head) && i > 0 && /^[A-Za-z]{4,}$/.test(lines[i - 1].trim())) head = `${lines[i - 1]} ${head}`;
    const names = head
      .split(/\s*(?:&|\+|,|\band\b|\bwith\b)\s*/i)
      .map(cleanIngredient)
      .filter((n) => n.replace(/\s/g, '').length >= 4);
    if (names.length) return names;
  }
  return [];
}

/** "Ezetimibe IP ...... 10 mg", "equivalent to Clopidogrel 75 mg", "Each tablet contains: Thyroxine Sodium IP 50 mcg". */
function compositionIngredients(lines: string[]): Ingredient[] {
  const out: Ingredient[] = [];
  for (const raw of lines) {
    const line = raw.replace(/^.*?\b(contains|equivalent to)\s*:?\s*/i, '');
    const m = /^([A-Za-z][A-Za-z ]{2,40}?)\s*(?:tablets?|capsules?)?\s*(?:i\.?\s?p\.?|b\.?\s?p\.?|u\.?\s?s\.?\s?p\.?(?:-?nf)?)?[\s.…:_·-]*(\d+(?:\.\d+)?)\s*(mg|mcg|µg|ug|iu)\b/i.exec(line.trim());
    if (!m || NOT_INGREDIENT.test(m[1]) || COMPANY.test(m[1])) continue;
    const name = cleanIngredient(m[1]);
    if (name.replace(/\s/g, '').length < 4) continue;
    const ing = { name, strength: formatStrength(m[2], m[3]) };
    const i = out.findIndex((x) => sameIngredient(x.name, name));
    if (i >= 0) out[i] = /equivalent to/i.test(raw) ? ing : out[i];
    else out.push(ing);
  }
  return out;
}

function readIngredients(lines: string[]): Ingredient[] {
  const fromHeader = headerIngredients(lines);
  const fromComposition = compositionIngredients(lines);
  if (!fromHeader.length) return dropFragments(fromComposition);
  // Header gives the order and the full list; composition gives the strengths.
  const merged: Ingredient[] = fromHeader.map((name) => {
    const c = fromComposition.find((x) => sameIngredient(x.name, name));
    return { name: c && c.name.length >= name.length ? c.name : name, strength: c?.strength };
  });
  for (const c of fromComposition) if (!merged.some((x) => sameIngredient(x.name, c.name))) merged.push(c);
  return dropFragments(merged);
}

/** "CILACAR® T" -> Cilacar T; "NEBICARD-2.5" -> Nebicard + 2.5; "DOLO-650" -> Dolo + 650. */
function brandCandidate(line: string, ingredients: Ingredient[]): { name: string; strength?: string; reg: boolean } | undefined {
  if (line.length > 32 || PACKAGING.test(line) || COMPANY.test(line) || EXCIPIENT.test(line) || WARNING_BOX.test(line)) return undefined;
  const reg = /[®™]/.test(line);
  const start = line.replace(/^[^A-Za-z]+/, '');
  if (!/^[A-Z]/.test(start)) return undefined; // torn or partial words start mid-word, in lower case
  const cleaned = start.replace(/([A-Za-z])[89@]\s?(\d{1,4}(?:\.\d+)?)\b/g, '$1 $2').replace(/[®™©Ⓡ]/g, ' ').replace(NOISE, ' ').replace(SALTS, ' ').replace(/[^A-Za-z0-9.\- ]/g, ' ');
  const m = /^\s*([A-Za-z][A-Za-z\-]*(?:\s+[A-Za-z][A-Za-z\-]*){0,2})[\s-]*(\d+(?:\.\d+)?\s*(?:mg|mcg|ml|iu|k)?)?/i.exec(cleaned);
  if (!m) return undefined;
  const name = m[1].replace(/-+$/, '').replace(/-/g, ' ').trim();
  if (name.replace(/\s/g, '').length < 3) return undefined;
  if (ingredients.some((i) => name.toLowerCase().split(' ').some((w) => w.length >= 5 && sameIngredient(w, i.name)))) return undefined;
  // A piece of the medicine's own name ("Mononitrate" of "Isosorbide Mononitrate") isn't a brand.
  if (ingredients.some((i) => fragmentOf(titleCase(name), i.name) || i.name.toLowerCase().split(' ').includes(name.toLowerCase()))) return undefined;
  let strength: string | undefined;
  if (m[2]) {
    const s = STRENGTH.exec(m[2]) ?? /\b(\d{1,4}(?:\.\d+)?)\b/.exec(m[2]);
    if (s) strength = formatStrength(s[1], s[2]);
  }
  return { name: titleCase(name), strength, reg };
}

export function describeIngredients(ings: Ingredient[]): string {
  return ings.map((i) => (i.strength ? `${i.name} ${/^\d/.test(i.strength) && !/[a-z]/i.test(i.strength) ? `${i.strength} mg` : i.strength}` : i.name)).join(' + ');
}

/**
 * Reads a strip / bottle / box. The medicine contents are read first (the generic name and strength,
 * including combinations), then the brand, which is often smaller, torn off or printed upside down.
 */
export function parseLabel(lines: OcrLine[], barcode?: string): LabelResult {
  const texts = lines.map((l) => l.text);
  const rows = mergeRows(lines);
  const allText = texts.join('\n');
  const unit = detectForm(allText) ?? 'tablet';

  const ingredients = readIngredients([...new Set([...texts, ...rows])]);

  // Brand: prominent text that isn't the ingredient, a company or packaging small print.
  const scored = lines
    .map((l, i) => {
      const b = brandCandidate(l.text, ingredients);
      if (!b) return undefined;
      const h = l.height ?? 10;
      return { ...b, score: h * (1 + (b.strength ? 0.6 : 0) + (b.reg ? 0.5 : 0)) - i * 0.001 };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => b.score - a.score);
  // Same brand printed several times on a strip: count it; torn pieces ("OTRATE") give way to the full word.
  const key = (n: string) => n.toLowerCase().replace(/[^a-z]/g, '');
  const counts = new Map<string, number>();
  for (const b of scored) counts.set(key(b.name), (counts.get(key(b.name)) ?? 0) + 1);
  const whole = scored.filter((b) => !scored.some((o) => key(o.name).length > key(b.name).length + 1 && key(o.name).endsWith(key(b.name))));
  const ranked = whole
    .map((b) => ({ ...b, score: b.score + Math.min(counts.get(key(b.name)) ?? 1, 4) * 6 }))
    .sort((a, b) => b.score - a.score);
  const brands: typeof scored = [];
  for (const b of ranked) if (!brands.some((x) => key(x.name) === key(b.name))) brands.push(b);
  // A strength glued to any copy of the brand ("MONOTRATE®10") counts even if the biggest copy lost it.
  for (const b of brands) if (!b.strength) b.strength = scored.find((o) => key(o.name) === key(b.name) && o.strength)?.strength;
  // A name cut off at the edge of the photo ("Albuterol Sulf", "Pantopraz"): finish a word that can only be one
  // known medicine word, and drop a cut-off salt word. Only a unique completion is made; otherwise left as read.
  for (const b of brands) b.name = completeName(b.name);
  const brand = brands[0];

  // The built-in list fills gaps: contents of a known brand, or known brands of the contents read.
  const known = brand ? lookupBrand(brand.name) : undefined;
  // Printed as the brand ("Ventolin HFA"), not as read ("Ventolin Hfa").
  if (brand && known) {
    const printed = known.brands.find((b) => b.toLowerCase().replace(/[^a-z0-9]/g, '') === brand.name.toLowerCase().replace(/[^a-z0-9]/g, ''));
    if (printed) brand.name = printed;
  }
  // A box that prints only the contents ("Albuterol Sulfate"): the name is the contents.
  if (brand && !known && !ingredients.length && lookupIngredients([brand.name]).length) ingredients.push({ name: brand.name });
  if (known && !ingredients.length) {
    const parts = (brand?.strength ?? '').split('/');
    known.ingredients.forEach((n, i) => ingredients.push({ name: n, strength: parts.length === known.ingredients.length ? parts[i] : undefined }));
  }
  const knownBrands = ingredients.length ? lookupIngredients(ingredients.map((i) => i.name)).flatMap((e) => e.brands) : [];

  const genericName = ingredients.map((i) => i.name).join(' + ');
  const genericStrength = ingredients.map((i) => i.strength).filter(Boolean).join('/');
  const contents = describeIngredients(ingredients);
  const unitFinal = known?.unit && !detectForm(allText) ? known.unit : unit;

  let strength = brand?.strength ?? (ingredients.length && ingredients.every((i) => i.strength) ? genericStrength : '');
  // Inhalers print the dose per puff: "90 mcg per actuation", or "108 mcg albuterol sulfate (equivalent to 90 mcg albuterol)".
  if (!strength && unitFinal === 'puff') {
    const per = /(\d+(?:\.\d+)?)\s*(mcg|µg|mg)\s*(?:of\s+\w+\s+)?(?:per|\/|each)\s*(?:actuation|puff|inhalation|metered|dose)/i.exec(allText);
    const eq = /equivalent\s+to\s+(\d+(?:\.\d+)?)\s*(mcg|µg|mg)/i.exec(allText);
    // Otherwise only when one strength is printed at all ("90 mcg"); two different ones are left for a person.
    const all = [...new Set([...allText.matchAll(/(\d+(?:\.\d+)?)\s*(mcg|µg)\b/gi)].map((x) => x[1]))];
    const m = eq ?? per ?? (all.length === 1 ? ([all[0], all[0], 'mcg'] as unknown as RegExpExecArray) : null);
    if (m) strength = formatStrength(m[1], m[2].replace('µg', 'mcg'));
  }
  if (!strength && !ingredients.length && unit !== 'ml') {
    const s = STRENGTH.exec(allText);
    if (s) strength = formatStrength(s[1], s[2]);
  }

  const name = brand?.name ?? genericName;
  const genericAlias = ingredients.length ? ingredients.map((i) => `${i.name} ${i.strength ?? ''}`.trim()).join(' + ') : '';
  const aliases = brand && genericAlias && genericAlias.toLowerCase() !== brand.name.toLowerCase() ? [genericAlias] : [];

  const nameOptions = [
    ...brands.slice(0, 3).map((b) => b.name),
    ...(genericName && brand ? [genericName] : []),
    ...knownBrands.slice(0, 4), // e.g. torn Clopilet strip -> offers Clopilet, Plavix
  ];

  return {
    name,
    strength,
    unit: unitFinal,
    aliases,
    barcodes: barcode ? [barcode] : [],
    ingredients,
    contents,
    brand: brand?.name,
    // Form words ("Inhalation Aerosol", "Metered Actuations") and "NDC" are never the name.
    nameOptions: [...new Set(nameOptions)].filter((o) => !/^ndc$/i.test(o) && (!!lookupBrand(o) || !detectForm(o))),
  };
}

// ---------- Cut-off names ----------

const SALT_WORDS = ['HYDROCHLORIDE', 'BISULPHATE', 'BISULFATE', 'BESYLATE', 'BESILATE', 'MALEATE', 'TARTRATE', 'SUCCINATE', 'SODIUM', 'POTASSIUM',
  'CALCIUM', 'MAGNESIUM', 'DIHYDRATE', 'MONOHYDRATE', 'TRIHYDRATE', 'HYDROBROMIDE', 'MESYLATE', 'FUMARATE', 'CITRATE', 'PHOSPHATE', 'SULPHATE', 'SULFATE', 'ACETATE'];
let knownWords: string[] | undefined;
const medicineWords = () =>
  (knownWords ??= [...new Set(ALL_DRUGS.flatMap((d) => [...d.brands, ...d.ingredients]).flatMap((n) => n.toUpperCase().split(/[^A-Z]+/)).filter((w) => w.length >= 5))]);

/** "Albuterol Sulf" → "Albuterol"; "Pantopraz" → "Pantoprazole"; anything that isn't a unique completion stays as read. */
export function completeName(name: string): string {
  const words = medicineWords();
  const out = name.split(/\s+/).filter(Boolean).flatMap((w, i, all) => {
    const u = w.toUpperCase();
    if (!/^[A-Z]{3,}$/.test(u) || words.includes(u)) return [w];
    // A cut-off salt after the name ("Sulf", "Hydrochlor") is dropped, like a whole salt word.
    if (i > 0 && i === all.length - 1 && u.length >= 3 && SALT_WORDS.some((x) => x.startsWith(u) && x !== u)) return [];
    if (u.length < 5) return [w];
    const fits = words.filter((x) => x.length > u.length && x.startsWith(u));
    return fits.length === 1 ? [fits[0][0] + fits[0].slice(1).toLowerCase()] : [w];
  });
  return out.join(' ') || name;
}
