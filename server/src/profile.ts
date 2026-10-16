// The strip profile the server returns (spec 15, section 1) — without the phone-only parts
// (reference photos, embeddings). Everything the model returns is checked here; a field that
// doesn't pass is dropped and listed in `unsure`, so the helper fills it in on the phone.

import { isObj } from './http.ts';

export type RegionClass = 'brand' | 'contents' | 'strength' | 'expiry';

export interface ServerProfile {
  version: 1;
  brand: string;
  generic?: string;
  strength: string;
  maker?: string;
  form?: string; // tablet, capsule…
  tokens: string[];
  repeatsPerPocket?: boolean;
  grid?: { rows: number; cols: number };
  colours?: { foil: string; print: string[] };
  regions?: { cls: RegionClass; box: [number, number, number, number] }[];
  lookAlikes?: string[];
  expiry?: string; // YYYY-MM, as printed — kept on the phone only, never in the catalogue
}

export interface CheckedProfile {
  profile?: ServerProfile; // undefined when even brand + strength couldn't be read
  unsure: string[]; // fields left out because the model wasn't sure or the value didn't make sense
}

const str = (v: unknown, max: number, re?: RegExp): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/\s+/g, ' ').trim();
  if (!s || s.length > max) return undefined;
  if (re && !re.test(s)) return undefined;
  return s;
};

const NAME = /^[\p{L}\p{N} .,+\-/()&'®™]+$/u;
const HEX = /^#[0-9a-fA-F]{6}$/;
const CLASSES: RegionClass[] = ['brand', 'contents', 'strength', 'expiry'];

/**
 * Model output → safe profile. The model is asked for `confidence` (0…1) per field; anything below 0.6
 * is treated as not read. Brand and strength are required for a profile at all.
 */
export function checkProfile(raw: unknown): CheckedProfile {
  const unsure: string[] = [];
  if (!isObj(raw)) return { unsure: ['brand', 'strength'] };
  const conf = isObj(raw.confidence) ? raw.confidence : {};
  const sure = (field: string) => {
    const c = conf[field];
    return typeof c !== 'number' || c >= 0.6;
  };
  const take = <T>(field: string, v: T | undefined): T | undefined => {
    if (v === undefined || !sure(field)) {
      if (raw[field] !== undefined && raw[field] !== null) unsure.push(field);
      return undefined;
    }
    return v;
  };

  const brand = take('brand', str(raw.brand, 40, NAME));
  const strength = take('strength', str(raw.strength, 30, /^[\d.,/ +]+\s*(mg|mcg|µg|g|iu|ml|%|mg\/ml)?( ?[+/] ?[\d.]+\s*(mg|mcg|µg|g|iu|ml|%)?)*$/i));
  if (!brand || !strength) {
    for (const f of ['brand', 'strength']) if (!unsure.includes(f)) unsure.push(f);
    return { unsure };
  }
  const p: ServerProfile = { version: 1, brand, strength, tokens: [] };

  const generic = take('generic', str(raw.generic, 80, NAME));
  if (generic) p.generic = generic;
  const maker = take('maker', str(raw.maker, 60, NAME));
  if (maker) p.maker = maker;
  const form = take('form', str(raw.form, 20, /^[a-z ]+$/i));
  if (form) p.form = form.toLowerCase();

  const tokens = Array.isArray(raw.tokens) ? raw.tokens.map((t) => str(t, 24)?.toUpperCase()).filter((t): t is string => !!t && /^[A-Z0-9.]{2,24}$/.test(t)) : [];
  p.tokens = [...new Set(tokens)].slice(0, 20);

  if (typeof raw.repeatsPerPocket === 'boolean' && sure('repeatsPerPocket')) p.repeatsPerPocket = raw.repeatsPerPocket;

  if (isObj(raw.grid)) {
    const rows = Number(raw.grid.rows);
    const cols = Number(raw.grid.cols);
    const g = Number.isInteger(rows) && Number.isInteger(cols) && rows >= 1 && rows <= 6 && cols >= 1 && cols <= 15 ? { rows, cols } : undefined;
    const v = take('grid', g);
    if (v) p.grid = v;
    else if (!g && !unsure.includes('grid')) unsure.push('grid');
  }

  if (isObj(raw.colours)) {
    const foil = str(raw.colours.foil, 7, HEX);
    const print = Array.isArray(raw.colours.print) ? raw.colours.print.map((c) => str(c, 7, HEX)).filter((c): c is string => !!c).slice(0, 4) : [];
    if (foil && sure('colours')) p.colours = { foil: foil.toLowerCase(), print: print.map((c) => c.toLowerCase()) };
  }

  if (Array.isArray(raw.regions)) {
    const regions = raw.regions
      .filter(isObj)
      .map((r) => ({ cls: r.cls as RegionClass, box: Array.isArray(r.box) ? r.box.map(Number) : [] }))
      .filter((r) => CLASSES.includes(r.cls) && r.box.length === 4 && r.box.every((n) => n >= 0 && n <= 1) && r.box[2] > r.box[0] && r.box[3] > r.box[1])
      .slice(0, 8) as ServerProfile['regions'];
    if (regions?.length && sure('regions')) p.regions = regions;
  }

  if (Array.isArray(raw.lookAlikes)) {
    const la = raw.lookAlikes.map((x) => str(x, 40, NAME)).filter((x): x is string => !!x).slice(0, 5);
    if (la.length) p.lookAlikes = la;
  }

  const expiry = take('expiry', str(raw.expiry, 7, /^20\d\d-(0[1-9]|1[0-2])$/));
  if (expiry) p.expiry = expiry;

  return { profile: p, unsure };
}

/** The part of a profile that is the same for every strip of this product — what the catalogue may keep. */
export function catalogueCore(p: ServerProfile): Omit<ServerProfile, 'expiry'> {
  const { expiry: _expiry, ...core } = p;
  return core;
}

/** Catalogue key: brand + strength, normalised ("Clopilet 75 mg" → "CLOPILET|75MG"). The maker is a variant inside. */
export function catalogueKey(brand: string, strength: string): string {
  const n = (s: string) => s.toUpperCase().replace(/[^A-Z0-9.]/g, '');
  return `${n(brand)}|${n(strength).replace(/^(\d+(\.\d+)?)$/, '$1MG')}`;
}
