// A small built-in list of common Indian medicine brands and what's inside them.
// Used only to SUGGEST (fill in contents, recognise torn strips, spot same-medicine substitutes).
// Every suggestion is shown to a person to confirm. Not a source of dosing or interaction advice.
// Compiled from general knowledge (mid-2026); brands change — anything not listed is simply not suggested.

export interface DrugEntry {
  brands: string[]; // brand names as printed (first is the main one)
  ingredients: string[]; // generic names, in label order
  strengths: string[]; // common strengths as printed; combos as "10/40"
  unit?: string; // tablet (default), capsule, ml...
}

export const DRUGS: DrugEntry[] = [
  // Pain / fever
  { brands: ['Dolo'], ingredients: ['Paracetamol'], strengths: ['500', '650'] },
  { brands: ['Crocin', 'Calpol', 'P 500'], ingredients: ['Paracetamol'], strengths: ['500', '650'] },
  // Blood pressure / heart
  { brands: ['Telma', 'Telmikind', 'Telsartan'], ingredients: ['Telmisartan'], strengths: ['20', '40', '80'] },
  { brands: ['Telma H'], ingredients: ['Telmisartan', 'Hydrochlorothiazide'], strengths: ['40/12.5', '80/12.5'] },
  { brands: ['Telma AM'], ingredients: ['Telmisartan', 'Amlodipine'], strengths: ['40/5', '80/5'] },
  { brands: ['Amlong', 'Amlokind', 'Stamlo', 'Amlopres', 'Amlip'], ingredients: ['Amlodipine'], strengths: ['2.5', '5', '10'] },
  { brands: ['Cilacar', 'Cilnidip'], ingredients: ['Cilnidipine'], strengths: ['5', '10', '20'] },
  { brands: ['Cilacar T'], ingredients: ['Cilnidipine', 'Telmisartan'], strengths: ['10/40'] },
  { brands: ['Losar', 'Repace', 'Losacar'], ingredients: ['Losartan'], strengths: ['25', '50'] },
  { brands: ['Olmezest', 'Benitec'], ingredients: ['Olmesartan'], strengths: ['20', '40'] },
  { brands: ['Nebicard', 'Nebistar', 'Nodon'], ingredients: ['Nebivolol'], strengths: ['2.5', '5', '10'] },
  { brands: ['Concor'], ingredients: ['Bisoprolol'], strengths: ['2.5', '5'] },
  { brands: ['Metolar', 'Met XL', 'Revelol', 'Starpress XL'], ingredients: ['Metoprolol'], strengths: ['12.5', '25', '50'] },
  { brands: ['Cardivas', 'Carca'], ingredients: ['Carvedilol'], strengths: ['3.125', '6.25', '12.5', '25'] },
  { brands: ['Vymada', 'Entresto'], ingredients: ['Sacubitril', 'Valsartan'], strengths: ['24/26', '49/51', '97/103'] },
  { brands: ['Ismo', 'Monotrate', 'Monit'], ingredients: ['Isosorbide Mononitrate'], strengths: ['10', '20', '30', '60'] },
  { brands: ['Sorbitrate', 'Isordil'], ingredients: ['Isosorbide Dinitrate'], strengths: ['5', '10'] },
  { brands: ['Cordarone', 'Tachyra', 'Eurythmic'], ingredients: ['Amiodarone'], strengths: ['100', '200'] },
  { brands: ['Lanoxin'], ingredients: ['Digoxin'], strengths: ['0.25'] },
  { brands: ['Ranozex'], ingredients: ['Ranolazine'], strengths: ['500'] },
  // Diuretics
  { brands: ['Tide', 'Dytor'], ingredients: ['Torsemide'], strengths: ['5', '10', '20'] },
  { brands: ['Lasix'], ingredients: ['Furosemide'], strengths: ['20', '40'] },
  { brands: ['Aldactone'], ingredients: ['Spironolactone'], strengths: ['25', '50'] },
  // Blood thinners / cholesterol
  { brands: ['Clopilet', 'Plavix', 'Clopitab', 'Deplatt'], ingredients: ['Clopidogrel'], strengths: ['75'] },
  { brands: ['Ecosprin', 'Loprin'], ingredients: ['Aspirin'], strengths: ['75', '150'] },
  { brands: ['Ecosprin AV'], ingredients: ['Aspirin', 'Atorvastatin'], strengths: ['75/10', '75/20', '150/20'] },
  { brands: ['Brilinta', 'Axcer'], ingredients: ['Ticagrelor'], strengths: ['60', '90'] },
  { brands: ['Eliquis'], ingredients: ['Apixaban'], strengths: ['2.5', '5'] },
  { brands: ['Xarelto'], ingredients: ['Rivaroxaban'], strengths: ['10', '15', '20'] },
  { brands: ['Acitrom'], ingredients: ['Acenocoumarol'], strengths: ['1', '2', '4'] },
  { brands: ['Atorva', 'Lipvas', 'Storvas', 'Tonact', 'Atorlip'], ingredients: ['Atorvastatin'], strengths: ['10', '20', '40', '80'] },
  { brands: ['Rosuvas', 'Rozavel', 'Crestor'], ingredients: ['Rosuvastatin'], strengths: ['5', '10', '20', '40'] },
  { brands: ['Brillo'], ingredients: ['Bempedoic Acid'], strengths: ['180'] },
  { brands: ['Brillo EZ'], ingredients: ['Bempedoic Acid', 'Ezetimibe'], strengths: ['180/10'] },
  { brands: ['Ezedoc'], ingredients: ['Ezetimibe'], strengths: ['10'] },
  // Diabetes / thyroid
  { brands: ['Glycomet', 'Glyciphage', 'Obimet'], ingredients: ['Metformin'], strengths: ['250', '500', '850', '1000'] },
  { brands: ['Glycomet GP'], ingredients: ['Metformin', 'Glimepiride'], strengths: ['500/0.5', '500/1', '500/2', '1000/1', '1000/2'] },
  { brands: ['Amaryl'], ingredients: ['Glimepiride'], strengths: ['0.5', '1', '2', '3', '4'] },
  { brands: ['Januvia', 'Istavel'], ingredients: ['Sitagliptin'], strengths: ['25', '50', '100'] },
  { brands: ['Galvus', 'Jalra'], ingredients: ['Vildagliptin'], strengths: ['50'] },
  { brands: ['Jardiance', 'Gibtulio'], ingredients: ['Empagliflozin'], strengths: ['10', '25'] },
  { brands: ['Forxiga'], ingredients: ['Dapagliflozin'], strengths: ['5', '10'] },
  { brands: ['Thyronorm', 'Eltroxin', 'Thyrox'], ingredients: ['Thyroxine'], strengths: ['12.5', '25', '50', '75', '88', '100', '125'] },
  // Stomach
  { brands: ['Pan', 'Pantocid', 'Pantop'], ingredients: ['Pantoprazole'], strengths: ['20', '40'] },
  { brands: ['Pan D', 'Pantocid DSR'], ingredients: ['Pantoprazole', 'Domperidone'], strengths: ['40/30'], unit: 'capsule' },
  { brands: ['Razo', 'Rabicip', 'Happi'], ingredients: ['Rabeprazole'], strengths: ['10', '20'] },
  { brands: ['Omez'], ingredients: ['Omeprazole'], strengths: ['20', '40'], unit: 'capsule' },
  { brands: ['Vonasec', 'Vonzai'], ingredients: ['Vonoprazan'], strengths: ['10', '20'] },
  { brands: ['Kerendia'], ingredients: ['Finerenone'], strengths: ['10', '20'] },
  { brands: ['Sucrafil'], ingredients: ['Sucralfate'], strengths: [], unit: 'ml' },
  { brands: ['Ondem', 'Emeset'], ingredients: ['Ondansetron'], strengths: ['4', '8'] },
  { brands: ['Duphalac'], ingredients: ['Lactulose'], strengths: [], unit: 'ml' },
  // Allergy / chest
  { brands: ['Montair LC', 'Montek LC'], ingredients: ['Montelukast', 'Levocetirizine'], strengths: ['10/5'] },
  { brands: ['Allegra'], ingredients: ['Fexofenadine'], strengths: ['120', '180'] },
  { brands: ['Levocet', 'Xyzal'], ingredients: ['Levocetirizine'], strengths: ['5'] },
  // Vitamins / minerals
  { brands: ['Shelcal', 'Calcimax'], ingredients: ['Calcium', 'Vitamin D3'], strengths: ['500'] },
  { brands: ['Uprise D3', 'D Rise'], ingredients: ['Cholecalciferol'], strengths: ['60K'], unit: 'capsule' },
  { brands: ['Becosules'], ingredients: ['Multivitamin'], strengths: [], unit: 'capsule' },
  // Other common
  { brands: ['Zyloric'], ingredients: ['Allopurinol'], strengths: ['100', '300'] },
  { brands: ['Febustat', 'Zurig'], ingredients: ['Febuxostat'], strengths: ['40', '80'] },
  { brands: ['Gabapin'], ingredients: ['Gabapentin'], strengths: ['100', '300'] },
  { brands: ['Nexito', 'Cipralex'], ingredients: ['Escitalopram'], strengths: ['5', '10', '20'] },
  { brands: ['Azithral', 'Azee'], ingredients: ['Azithromycin'], strengths: ['250', '500'] },
  { brands: ['Augmentin'], ingredients: ['Amoxicillin', 'Clavulanic Acid'], strengths: ['375', '625'] },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Finds the entry for a brand name ("NEBICARD", "Cilacar T", "Clopilet / Plavix"). Longest brand wins (Telma H over Telma). */
export function lookupBrand(name: string): DrugEntry | undefined {
  const n = norm(name);
  if (n.length < 3) return undefined;
  let best: { e: DrugEntry; len: number } | undefined;
  for (const e of DRUGS) {
    for (const b of e.brands) {
      const nb = norm(b);
      if (n === nb || (n.startsWith(nb) && nb.length >= 4 && !/^[a-z]/.test(n.slice(nb.length)))) {
        if (!best || nb.length > best.len) best = { e, len: nb.length };
      }
    }
  }
  return best?.e;
}

/** Entries whose contents are exactly these ingredients (any order). */
export function lookupIngredients(ingredients: string[]): DrugEntry[] {
  const want = ingredients.map(norm).sort().join('+');
  if (!want) return [];
  return DRUGS.filter((e) => e.ingredients.map(norm).sort().join('+') === want);
}

/** "Clopidogrel 75", "Cilnidipine 10 + Telmisartan 40" from contents and a strength like "10/40". */
export function genericLabel(ingredients: string[], strength: string): string {
  const parts = strength.split('/').map((s) => s.trim()).filter(Boolean);
  if (parts.length === ingredients.length) return ingredients.map((g, i) => `${g} ${parts[i]}`).join(' + ');
  return ingredients.join(' + ');
}

/**
 * Extra names the same medicine could be printed as, from the built-in list:
 * the contents ("Clopidogrel 75") and other brands of the same contents ("Plavix 75").
 * Returns [] when the medicine isn't in the list.
 */
export function relatedNames(med: { name: string; strength: string }): { generic?: string; otherBrands: string[] } {
  const entry = lookupBrand(med.name) ?? lookupIngredients(med.name.split(/\s*\+\s*/))[0];
  if (!entry) return { otherBrands: [] };
  const strength = med.strength.replace(/\s*mg\b/i, '').trim();
  const generic = genericLabel(entry.ingredients, strength);
  const otherBrands = lookupIngredients(entry.ingredients)
    .flatMap((e) => e.brands)
    .filter((b) => norm(b) !== norm(med.name))
    .map((b) => `${b} ${strength}`.trim());
  return { generic: generic.trim() || undefined, otherBrands };
}
