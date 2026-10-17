// Substitute brands (spec 17, part A): is a strip from another brand exactly the same medicine as the one on the
// schedule? Same ingredients, same strength of each, same release form, same salt where it matters, same unit.
// Anything unknown is NOT treated as the same — the app asks. Pure, no I/O.
// Never used to suggest a switch; only to recognise a brand the pharmacy already gave, after a person confirms.

import { ALL_DRUGS, genericLabel, lookupBrand, type DrugEntry, type ReleaseForm } from './drugdb.ts';
import { contentsOf } from './overlap.ts';

/** A medicine on the schedule, or what was read from a strip. */
export interface Product {
  name: string;
  strength: string;
  aliases?: string[];
  unit?: string;
  /** Other text printed on the strip, if the caller has it (adds "SR", "succinate" … that the name may lack). */
  printed?: string;
}

/** Why two products are not the same medicine, most important first. */
export type SwapReason = 'contents' | 'extraIngredient' | 'missingIngredient' | 'strength' | 'form' | 'salt' | 'unit';
/** What couldn't be told, so the app has to ask. */
export type SwapUnknown = 'contents' | 'strength' | 'salt';

export interface SwapCheck {
  ok: boolean; // exactly the same medicine
  reasons: SwapReason[];
  unknown: SwapUnknown[];
  ingredients: { usual: string[]; strip: string[] };
  extra: string[]; // in the strip, not in the usual medicine
  missing: string[]; // in the usual medicine, not in the strip
  form: { usual?: ReleaseForm; strip?: ReleaseForm }; // undefined = plain
  salt: { usual?: string; strip?: string };
  /** Same-salt brands of these medicines can still behave differently: the doctor should agree first. */
  askBeforeSwap: boolean;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Medicines where a change of maker should be checked with the doctor (narrow margin between too little and too much). */
export const ASK_BEFORE_SWAP = new Set(
  [
    'Amiodarone', 'Warfarin', 'Acenocoumarol', 'Thyroxine', 'Levothyroxine', 'Phenytoin', 'Carbamazepine',
    'Oxcarbazepine', 'Valproate', 'Sodium Valproate', 'Divalproex', 'Valproic Acid', 'Lamotrigine', 'Lithium',
    'Digoxin', 'Tacrolimus', 'Cyclosporine', 'Ciclosporin', 'Theophylline',
  ].map(norm),
);

// Words in a brand name that set the release form ("Isoket SR", "Met XL", "Glycomet SR"). "DR" is left out on
// purpose: it is printed as "Dr." in makers' names (Dr. Reddy's); delayed release comes only from the list.
const FORM_WORDS: Record<string, ReleaseForm> = {
  sr: 'SR', xl: 'ER', xr: 'ER', er: 'ER', pr: 'ER', od: 'ER', la: 'ER', retard: 'ER', cr: 'CR', mr: 'MR',
  odt: 'ODT', md: 'ODT',
};
// On the rest of the strip only unmistakable marks count (short words like "OD" or "ER" turn up in other text).
const PRINTED_FORMS: [RegExp, ReleaseForm][] = [
  [/\b(sr|sustained[ -]release|slow[ -]release)\b/, 'SR'],
  [/\b(xl|xr|extended[ -]release|prolonged[ -]release)\b/, 'ER'],
  [/\b(cr|controlled[ -]release)\b/, 'CR'],
  [/\b(mr|modified[ -]release)\b/, 'MR'],
];
const SALT_WORDS = ['tartrate', 'succinate', 'besylate', 'besilate', 'maleate', 'mesylate', 'hydrochloride', 'sodium', 'potassium'];

const contentsKey = (ingredients: string[]) => ingredients.map(norm).sort().join('+');
// Contents sold as more than one salt in the list (e.g. metoprolol): the salt must be known to say "same".
const SALT_VARIES = new Set<string>();
{
  const salts = new Map<string, Set<string>>();
  for (const e of ALL_DRUGS) if (e.salt) {
    const k = contentsKey(e.ingredients);
    salts.set(k, (salts.get(k) ?? new Set()).add(e.salt));
  }
  for (const [k, s] of salts) if (s.size > 1) SALT_VARIES.add(k);
}

const words = (p: Product, withPrinted: boolean) =>
  [p.name, ...(p.aliases ?? []), withPrinted ? (p.printed ?? '') : '']
    .join(' ').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** The name without release-form words ("Isoket SR" → "Isoket"), for looking up brands listed only in plain form. */
const baseName = (name: string) => name.split(/\s+/).filter((w) => !FORM_WORDS[w.toLowerCase().replace(/[^a-z]/g, '')]).join(' ');

const entryOf = (p: Product): DrugEntry | undefined =>
  lookupBrand(p.name) ?? lookupBrand(baseName(p.name)) ?? (p.aliases ?? []).map((a) => lookupBrand(a)).find(Boolean);

const ingredientsOf = (p: Product, withPrinted: boolean): string[] => {
  const aliases = [...(p.aliases ?? []), ...(withPrinted && p.printed ? [p.printed] : [])];
  const direct = contentsOf({ name: p.name, aliases });
  if (direct.length) return direct;
  const base = baseName(p.name);
  return base && base !== p.name ? contentsOf({ name: base, aliases }) : [];
};

/** The release form: from the name and printed words first ("Isoket SR"), then the medicine list. undefined = plain. */
export function formOf(p: Product): ReleaseForm | undefined {
  for (const w of words(p, false)) if (FORM_WORDS[w]) return FORM_WORDS[w];
  const printed = (p.printed ?? '').toLowerCase();
  for (const [re, f] of PRINTED_FORMS) if (re.test(printed)) return f;
  return entryOf(p)?.form;
}

function saltOf(p: Product): string | undefined {
  const w = words(p, true);
  const said = SALT_WORDS.find((s) => w.includes(s));
  if (said) return said === 'besilate' ? 'besylate' : said;
  return entryOf(p)?.salt;
}

/** Strength parts as numbers or plain text: "75 mg" → ["75"], "40/12.5" → ["40", "12.5"], "60K" → ["60k"]. */
function strengthParts(s: string): string[] {
  return s.toLowerCase().replace(/\b(mg|mcg|µg|ml|g|iu)\b/g, '').split('/').map((x) => x.replace(/\s+/g, '').replace(/^(\d+(?:\.\d+)?)$/, (n) => String(Number(n)))).filter(Boolean);
}

const unitKey = (u?: string) => (u ? u.toLowerCase().replace(/s$/, '').trim() : undefined);

/** Is `strip` exactly the same medicine as `usual`? */
export function exchangeable(usual: Product, strip: Product): SwapCheck {
  const cu = ingredientsOf(usual, false);
  const cs = ingredientsOf(strip, true);
  const reasons: SwapReason[] = [];
  const unknown: SwapUnknown[] = [];
  const su = new Set(cu.map(norm));
  const ss = new Set(cs.map(norm));
  const extra = cs.filter((g) => !su.has(norm(g)));
  const missing = cu.filter((g) => !ss.has(norm(g)));
  const form = { usual: formOf(usual), strip: formOf(strip) };
  const salt = { usual: saltOf(usual), strip: saltOf(strip) };

  if (!cu.length || !cs.length) unknown.push('contents');
  else if (extra.length === cs.length) reasons.push('contents');
  else {
    if (extra.length) reasons.push('extraIngredient');
    if (missing.length) reasons.push('missingIngredient');
  }

  if (!reasons.length) {
    const pu = strengthParts(usual.strength);
    const ps = strengthParts(strip.strength);
    if (!pu.length || !ps.length) unknown.push('strength');
    else if (pu.join('/') !== ps.join('/')) reasons.push('strength');
    if (form.usual !== form.strip) reasons.push('form');
    if (salt.usual && salt.strip && salt.usual !== salt.strip) reasons.push('salt');
    else if ((!salt.usual || !salt.strip) && cu.length && SALT_VARIES.has(contentsKey(cu))) unknown.push('salt');
    const uu = unitKey(usual.unit);
    const us = unitKey(strip.unit);
    if (uu && us && uu !== us) reasons.push('unit');
  }

  const askBeforeSwap = [...cu, ...cs].some((g) => ASK_BEFORE_SWAP.has(norm(g)));
  return {
    ok: !reasons.length && !unknown.length,
    reasons, unknown, ingredients: { usual: cu, strip: cs }, extra, missing, form, salt, askBeforeSwap,
  };
}

// ——— Plain words for the scan screen (spec 14: one short message) ———

const FORM_NAMES: Record<ReleaseForm, string> = {
  SR: 'slow-release (SR)', ER: 'extended-release', CR: 'controlled-release (CR)', MR: 'modified-release (MR)',
  DR: 'delayed-release', ODT: 'mouth-dissolving',
};
const formName = (f?: ReleaseForm) => (f ? FORM_NAMES[f] : 'plain');
const lower = (xs: string[]) => xs.map((x) => x.toLowerCase());
const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const label = (p: Product) => `${p.name} ${p.strength}`.trim();

/** "clopidogrel 75 mg", "telmisartan 40 + hydrochlorothiazide 12.5" — what the strip is, generically. */
export function genericLine(ingredients: string[], strength: string): string {
  const s = strengthParts(strength).join('/');
  const g = genericLabel(ingredients, s).toLowerCase();
  return ingredients.length === 1 && s && /^\d/.test(s) ? `${g} mg` : g;
}

/**
 * The one sentence saying how the strip differs from the person's medicine, or undefined when it's the same.
 * `who` is the member's name ("Papa"); without it the sentence speaks to the person ("Your …").
 */
export function differenceMessage(c: SwapCheck, usual: Product, strip: Product, who?: string): string | undefined {
  const whose = who ? `${who}'s` : 'Your';
  const takes = who ? `${who} takes` : 'You take';
  const [r] = c.reasons;
  if (r === 'contents') return `This is ${list(lower(c.ingredients.strip))}, not ${whose.toLowerCase() === 'your' ? 'your' : whose} ${label(usual)}.`;
  if (r === 'extraIngredient') {
    const only = c.ingredients.usual.length === 1 ? ` has only ${c.ingredients.usual[0].toLowerCase()}` : ` doesn't have ${c.extra.length > 1 ? 'them' : 'it'}`;
    return `This also contains ${list(lower(c.extra))}. ${whose} ${usual.name}${only}.`;
  }
  if (r === 'missingIngredient') return `This doesn't have ${list(lower(c.missing))}. ${whose} ${usual.name} has it too.`;
  if (r === 'strength') return `This is ${genericLine(c.ingredients.strip, strip.strength)}. ${takes} ${strengthParts(usual.strength).join('/')}.`;
  if (r === 'form') return `This is the ${formName(c.form.strip)} kind. ${whose} ${usual.name} is the ${formName(c.form.usual)} kind.`;
  if (r === 'salt') {
    const g = c.ingredients.usual[0]?.toLowerCase() ?? '';
    return `This is ${g} ${c.salt.strip}. ${whose} ${usual.name} is ${g} ${c.salt.usual}.`;
  }
  if (r === 'unit') return `This is a ${unitKey(strip.unit)}. ${whose} ${usual.name} is a ${unitKey(usual.unit)}.`;
  if (c.unknown.length) return `Can't tell if this is the same as ${whose.toLowerCase() === 'your' ? 'your' : whose} ${label(usual)}.`;
  return undefined;
}

/** Said after every "not the same" message. */
export const ASK_LINE = 'Ask the pharmacist or doctor before taking it.';
export const ASK_DOCTOR_LINE = 'Same medicine, different maker. For this medicine, ask your doctor before changing brands.';

/** The amber "different brand?" card, when `exchangeable` said ok. */
export function substituteCard(c: SwapCheck, usual: Product, strip: Product, who?: string) {
  const whose = who ? `${who}'s` : 'your';
  return {
    title: `Different brand of ${whose} ${label(usual)}?`,
    strip: { name: label(strip), generic: genericLine(c.ingredients.strip, strip.strength) },
    usual: { name: label(usual), generic: genericLine(c.ingredients.usual, usual.strength) },
    note: c.askBeforeSwap ? ASK_DOCTOR_LINE : undefined,
    yes: c.askBeforeSwap ? 'Doctor said it’s fine' : 'Yes, the pharmacy gave this',
    no: 'No',
  };
}
