// Turns OCR text from a printed prescription into draft schedule items.
// Every item is a *draft*: the app requires a person to check each one before it is added.
// Handles common Indian prescription notation: Tab./Cap./Syp., 1-0-1, OD/BD/TDS/QID/HS/SOS,
// before/after food (AC/PC), and durations like "x 5 days".

import { formatStrength, type MedDraft } from './label.ts';
import type { DoseTiming } from './types.ts';

export interface DraftDose {
  timing: DoseTiming;
  qty: number;
  days: number[];
}

export interface RxItem extends MedDraft {
  id: string;
  source: string; // the prescription text this item was read from
  doses: DraftDose[];
  durationDays?: number;
  asNeeded: boolean;
  warnings: string[];
  notes?: string; // instructions printed next to the medicine
}

const FORM_PREFIX: [RegExp, string][] = [
  [/^(tab|tabs|tablet|tablets)\.?$/i, 'tablet'],
  [/^t\.$/i, 'tablet'],
  [/^(cap|caps|capsule|capsules)\.?$/i, 'capsule'],
  [/^c\.$/i, 'capsule'],
  [/^(syp|syr|syrup|susp|liq)\.?$/i, 'ml'],
  [/^(drop|drops|gtt|gtts)\.?$/i, 'drops'],
  [/^(inh|inhaler|rotacap|rotacaps|respule|respules)\.?$/i, 'puff'],
  [/^(inj|injection)\.?$/i, 'injection'],
  [/^(sachet|sach|pwd|powder|granules)\.?$/i, 'sachet'],
];

const STOP_LINE = /^\s*(advice|adv|review|follow\s*-?up|f\/u|next visit|diagnosis|dx|c\/o|complaints?|investigations?|signature|sign|dr\.?\s|reg\.?\s*no)/i;

function formOf(word: string): string | undefined {
  for (const [re, unit] of FORM_PREFIX) if (re.test(word)) return unit;
  return undefined;
}

const stripNumbering = (s: string) => s.replace(/^\s*(?:\d{1,2}\s*[.)]|[-•*➤>])\s*/, '');

/**
 * Handwriting and OCR lose the dot after "T." / "C.": "T - PAN", "T PAN", "C: Pan", "Tab-Pan".
 * Rewrites the start to "T. PAN" so it is read as a new medicine, not as a line under the one above.
 * Needs a separator or a space, then a word of 3+ letters, so names like "Calpol" or "Telma" are untouched.
 */
function normalizeLead(line: string): string {
  return line.replace(/^(\s*(?:\d{1,2}\s*[.)]\s*)?)(t|c|tab|cap)(?:\s*[-–—·:,]\s*|\s+)(?=[A-Za-z]{3})/i, '$1$2. ');
}

/** Common OCR misreads of units next to a number: "625ma", "40 rng", "50 mcq". */
const fixUnits = (s: string) => s.replace(/(\d)\s*(?:ma|mq|rng|m9|mgm)\b/gi, '$1mg').replace(/(\d)\s*mcq\b/gi, '$1mcg');

/** Is this line the start of a medicine entry? Returns its form if so. */
function medStart(line: string): string | undefined {
  const words = stripNumbering(line).trim().split(/\s+/);
  if (!words[0]) return undefined;
  const f = formOf(words[0]);
  if (f) return f;
  // Numbered line with a name followed by a strength, e.g. "1) Dolo 650mg 1-0-1"
  if (/^\s*\d{1,2}\s*[.)]/.test(line) && /[A-Za-z]{3,}\s*-?\s*\d+(\.\d+)?\s*(mg|mcg|ml|iu|k)?\b/i.test(line)) return 'tablet';
  return undefined;
}

const FRACTION: Record<string, number> = { '½': 0.5, '1/2': 0.5, '¼': 0.25, '1/4': 0.25, '1½': 1.5 };
const num = (s: string) => FRACTION[s] ?? parseFloat(s);

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Converts morning/afternoon/(evening)/night counts into meal-linked doses. */
function countsToDoses(counts: number[], relation: 'before' | 'with' | 'after', days: number[]): DraftDose[] {
  const doses: DraftDose[] = [];
  const meal = (m: 'breakfast' | 'lunch' | 'dinner', qty: number) =>
    qty > 0 && doses.push({ timing: { kind: 'meal', meal: m, relation }, qty, days });
  if (counts.length === 4) {
    meal('breakfast', counts[0]);
    meal('lunch', counts[1]);
    if (counts[2] > 0) doses.push({ timing: { kind: 'custom', time: '18:00' }, qty: counts[2], days });
    meal('dinner', counts[3]);
  } else {
    meal('breakfast', counts[0]);
    meal('lunch', counts[1]);
    meal('dinner', counts[2]);
  }
  return doses;
}

function parseInstructions(text: string, unit: string): Pick<RxItem, 'doses' | 'durationDays' | 'asNeeded' | 'warnings'> {
  const t = ` ${text.toLowerCase().replace(/[–—]/g, '-')} `;
  const warnings: string[] = [];

  // Before / with / after food
  let relation: 'before' | 'with' | 'after' = 'after';
  if (/before\s*(food|meals?|breakfast|lunch|dinner|eating)|\bac\b|\ba\/c\b|\bbf\b|\bb\/f\b|empty stomach|khali pet/.test(t)) relation = 'before';
  else if (/with\s*(food|meals?|milk)/.test(t)) relation = 'with';
  else if (/after\s*(food|meals?|breakfast|lunch|dinner|eating)|\bpc\b|\bp\/c\b|\baf\b|\ba\/f\b/.test(t)) relation = 'after';
  else warnings.push('Before or after food is not written — set to after food.');

  // Days of the week / weekly
  let days: number[] = [];
  const named = DAY_NAMES.map((d, i) => (new RegExp(`\\b${d}(day)?\\b`).test(t) ? i : -1)).filter((i) => i >= 0);
  if (named.length) days = named;
  else if (/once\s*(a|per|every)\s*week|\bweekly\b|every\s*week/.test(t)) {
    days = [0];
    warnings.push('Weekly dose — check which day (set to Sunday).');
  }

  // Duration
  let durationDays: number | undefined;
  const dur = /(?:x|×|for)\s*(\d{1,3})\s*(days?|d|weeks?|wks?|w|months?|m)\b/.exec(t) ?? /\b(\d{1,3})\s*(days?|weeks?|months?)\b/.exec(t);
  if (dur) {
    const n = parseInt(dur[1], 10);
    const u = dur[2][0];
    durationDays = u === 'w' ? n * 7 : u === 'm' ? n * 30 : n;
  }

  // As needed
  const asNeeded = /\b(sos|prn|as needed|when needed|if needed|when required|if required)\b/.test(t);

  // Quantity for liquids: "5 ml", "1 tsp" (= 5 ml)
  let liquidQty: number | undefined;
  if (unit === 'ml') {
    const ml = /(\d+(?:\.\d+)?)\s*ml\b/.exec(t);
    const tsp = /(\d+(?:\.\d+)?|½)?\s*(tsp|tsf|teaspoons?)\b/.exec(t);
    if (ml) liquidQty = parseFloat(ml[1]);
    else if (tsp) liquidQty = (tsp[1] ? num(tsp[1]) : 1) * 5;
  }

  // How often
  let counts: number[] | undefined;
  const t2 = t.replace(/(^|[\s(])([0-9½¼ilo|]\s*-\s*[0-9½¼ilo|]\s*-\s*[0-9½¼ilo|](?:\s*-\s*[0-9½¼ilo|])?)(?=[\s),]|$)/g, (_m, pre: string, p: string) =>
    pre + p.replace(/[il|]/g, '1').replace(/o/g, '0'),
  );
  const pat = /(?:^|[^\d/])(1½|½|¼|1\/2|1\/4|\d)\s*-\s*(1½|½|¼|1\/2|1\/4|\d)\s*-\s*(1½|½|¼|1\/2|1\/4|\d)(?:\s*-\s*(1½|½|¼|1\/2|1\/4|\d))?(?![\d/])/.exec(t2);
  let doses: DraftDose[] = [];
  if (pat) counts = [pat[1], pat[2], pat[3], pat[4]].filter((x) => x !== undefined).map(num);
  else if (/\b(qid|q\.i\.d|four times)\b/.test(t)) counts = [1, 1, 1, 1];
  else if (/\b(tds|tid|t\.d\.s|t\.i\.d|thrice|three times)\b/.test(t)) counts = [1, 1, 1];
  else if (/\b(bd|bid|b\.d|b\.i\.d|twice)\b/.test(t)) counts = [1, 0, 1];
  else if (/\b(hs|h\.s|at bed\s*time|bedtime)\b/.test(t)) {
    doses = [{ timing: { kind: 'custom', time: '22:00' }, qty: 1, days }];
  } else if (/\b(od|o\.d|qd|once (a )?daily|once a day|daily|once)\b/.test(t) || days.length) {
    counts = /\b(night|evening|dinner)\b/.test(t) ? [0, 0, 1] : /\b(afternoon|lunch)\b/.test(t) ? [0, 1, 0] : [1, 0, 0];
    if (!/\b(morning|breakfast|night|evening|dinner|afternoon|lunch)\b/.test(t)) warnings.push('Once a day — time of day not written (set to morning).');
  }
  if (counts) doses = countsToDoses(counts, relation, days);

  if (liquidQty) doses = doses.map((d) => ({ ...d, qty: liquidQty! }));

  if (asNeeded && !doses.length) warnings.push('Taken only when needed (SOS) — no reminders will be set.');
  else if (!doses.length) warnings.push("Couldn't read how often to take it — set the times.");
  return { doses, durationDays, asNeeded, warnings };
}

function parseNameLine(line: string, form: string): { name: string; strength: string; rest: string } {
  const words = stripNumbering(line).trim().split(/\s+/);
  if (formOf(words[0])) words.shift();
  const nameWords: string[] = [];
  let i = 0;
  for (; i < words.length; i++) {
    const w = words[i];
    if (/^[A-Za-z]{1,3}\d{1,2}$/.test(w) && nameWords.length) {
      nameWords.push(w); // D3, B12, Q10 are part of the name
      continue;
    }
    if (/\d/.test(w) || /^\(/.test(w) || /^(od|bd|tds|tid|qid|hs|sos|x|for|after|before|with|morning|night|daily|ac|pc)$/i.test(w)) break;
    nameWords.push(w.replace(/[^A-Za-z\-+]/g, ''));
  }
  // "Dolo-650" style: name with attached strength
  let strength = '';
  const glued = /^([A-Za-z][A-Za-z\-]*?)-?(\d+(?:\.\d+)?)(mg|mcg|ml|iu|k)?$/i.exec(words[i] ?? '');
  if (glued && /[A-Za-z]/.test(words[i])) {
    nameWords.push(glued[1].replace(/-$/, ''));
    strength = formatStrength(glued[2], glued[3]);
    i++;
  } else if (words[i] && !/^\d\s*-/.test(words.slice(i).join(' '))) {
    const s = /^(\d+(?:\.\d+)?)(mg|mcg|µg|ml|gm|g|iu|k)?$/i.exec(words[i]);
    if (s) {
      let unit = s[2];
      let next = i + 1;
      if (!unit && /^(mg|mcg|µg|ml|gm|g|iu)$/i.test(words[next] ?? '')) unit = words[next++];
      // For syrups, "5 ml" is the dose, not a strength.
      if (!(form === 'ml' && /^ml$/i.test(unit ?? ''))) {
        strength = formatStrength(s[1], unit);
        i = next;
      }
    }
  }
  const name = nameWords
    .filter(Boolean)
    .join(' ')
    .replace(/-+/g, ' ')
    .trim()
    .replace(/\b\w+/g, (w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()));
  return { name, strength, rest: words.slice(i).join(' ') };
}

/** Parse prescription text (one OCR line per entry) into draft items. */
export function parsePrescription(lines: string[], makeId: () => string): RxItem[] {
  // Daily-timetable layout ("7:00 AM | Thyroxin 50 mcg"): times in one column, medicines in another.
  if (lines.filter((l) => parseClock(l)).length >= 2) {
    const fromTable = parseTimetable(lines, makeId);
    if (fromTable.length) return fromTable;
  }
  return parseRxLines(lines, makeId);
}

// ---------- Daily timetable / medicine chart ----------

const CLOCK =
  /^\s*(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?(?:\s*(?:-|–|—|to)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?)?(?=\s|$)/i;

/** "7:45 AM Tide 20 mg" -> { time: "07:45", rest: "Tide 20 mg" }. Needs minutes or AM/PM to count as a time. */
export function parseClock(line: string): { time: string; rest: string } | undefined {
  const m = CLOCK.exec(line);
  if (!m || (!m[2] && !m[3])) return undefined;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (h > 23 || min > 59) return undefined;
  const ap = (m[3] ?? m[6] ?? '').toLowerCase().replace(/[^ap]/g, '');
  if (ap === 'p' && h < 12) h += 12;
  if (ap === 'a' && h === 12) h = 0;
  return { time: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`, rest: line.slice(m[0].length).trim() };
}

const HEADER = /^(morning|afternoon|evening|night|bed\s*time|time|what to take|done|date\b|my daily medicines|medicines?)\b/i;
const MEAL_ROW = /^(breakfast|lunch|dinner|supper|meal)\b/i;
const INSTRUCTION = /^(take|check|eat|tea|use|stay|nothing|before|after|at|with|do|don'?t|if|keep|avoid|only|then|and|or|note|\d+(st|nd|rd|th))\b/i;

const MED_LINE =
  /^([A-Z][A-Za-z]+(?:[ -][A-Za-z]+){0,2}?)(?:\s*\/\s*([A-Z][A-Za-z]+(?:[ -][A-Za-z]+){0,2}?))?\s*(syrup|syp|suspension|susp|tablets?|tab|capsules?|cap|drops|inhaler)?\s*[-–]?\s*(\d+(?:\.\d+)?)\s*(mg|mcg|µg|ml|iu|k|g)?\b(.*)$/i;

interface TableMed {
  name: string;
  alt?: string;
  unit: string;
  strength: string;
  qty: number;
}

function parseTableMed(line: string): TableMed | undefined {
  if (INSTRUCTION.test(line) || HEADER.test(line) || MEAL_ROW.test(line)) return undefined;
  const m = MED_LINE.exec(line.trim());
  if (!m) return undefined;
  const rest = m[6].replace(/\([^)]*\)/g, '').trim();
  if (rest.length > 12) return undefined; // a sentence with a number in it, not a medicine
  const formWord = (m[3] ?? '').toLowerCase();
  const unitWord = (m[5] ?? '').toLowerCase();
  const liquid = /syr|syp|susp/.test(formWord) || unitWord === 'ml';
  const unit = liquid ? 'ml' : /cap/.test(formWord) ? 'capsule' : /drop/.test(formWord) ? 'drops' : /inhal/.test(formWord) ? 'puff' : 'tablet';
  const tidy = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/\b\w+/g, (w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()));
  return {
    name: tidy(m[1]),
    alt: m[2] ? tidy(m[2]) : undefined,
    unit,
    strength: liquid ? '' : formatStrength(m[4], m[5]),
    qty: liquid && unitWord === 'ml' ? parseFloat(m[4]) : 1,
  };
}

export function parseTimetable(lines: string[], makeId: () => string): RxItem[] {
  type Acc = { med: TableMed; doses: DraftDose[]; source: string[]; notes: string[] };
  const byKey = new Map<string, Acc>();
  let time: string | undefined;
  let rowMeds: Acc[] = [];
  let rowNotes: string[] = [];

  const flushNotes = () => {
    if (!rowNotes.length) return;
    const note = rowNotes.join(' ').replace(/\s+/g, ' ').trim();
    for (const a of rowMeds) if (!a.notes.includes(note)) a.notes.push(`${note}`);
    rowNotes = [];
  };

  for (const raw of lines) {
    let line = raw.trim();
    if (!line) continue;
    const clock = parseClock(line);
    if (clock) {
      flushNotes();
      time = clock.time;
      rowMeds = [];
      line = clock.rest;
      if (!line) continue;
    }
    if (!time) continue; // title area above the first time
    if (HEADER.test(line)) {
      flushNotes();
      continue;
    }
    if (MEAL_ROW.test(line)) {
      flushNotes();
      rowMeds = [];
      continue;
    }
    const med = parseTableMed(line);
    if (med) {
      const key = `${med.name.toLowerCase()}|${med.strength}|${med.unit}`;
      let acc = byKey.get(key);
      if (!acc) {
        acc = { med, doses: [], source: [], notes: [] };
        byKey.set(key, acc);
      }
      if (!acc.doses.some((d) => d.timing.kind === 'custom' && d.timing.time === time)) {
        acc.doses.push({ timing: { kind: 'custom', time }, qty: med.qty, days: [] });
      }
      acc.source.push(`${time}  ${line}`);
      if (!rowMeds.includes(acc)) rowMeds.push(acc);
      continue;
    }
    if (rowMeds.length) rowNotes.push(line);
  }
  flushNotes();

  return [...byKey.values()].map(({ med, doses, source, notes }) => {
    const warnings: string[] = [];
    const note = notes.join(' ');
    if (/\b(if|do not|don'?t|skip|check|below|above|hold)\b/i.test(note)) warnings.push('Has a special instruction — read it in Notes and keep it.');
    if (!med.strength && med.unit !== 'ml') warnings.push('Strength not found — check the chart.');
    return {
      id: makeId(),
      name: med.name,
      strength: med.strength,
      unit: med.unit,
      aliases: med.alt ? [`${med.alt} ${med.strength}`.trim()] : [],
      barcodes: [],
      source: source.join('\n'),
      doses: doses.sort((a, b) => (a.timing.kind === 'custom' && b.timing.kind === 'custom' ? a.timing.time.localeCompare(b.timing.time) : 0)),
      asNeeded: false,
      warnings,
      notes: note || undefined,
    };
  });
}

// ---------- Doctor's prescription lines ("Tab. Dolo 650 1-0-1") ----------

function parseRxLines(lines: string[], makeId: () => string): RxItem[] {
  const items: { form: string; lines: string[] }[] = [];
  let cur: { form: string; lines: string[] } | null = null;
  for (const raw of lines) {
    const line = fixUnits(normalizeLead(raw.trim()));
    if (!line) continue;
    if (STOP_LINE.test(line)) {
      cur = null;
      continue;
    }
    const form = medStart(line);
    if (form) {
      cur = { form, lines: [line] };
      items.push(cur);
    } else if (cur && cur.lines.length < 3) {
      // A timing like 1-0-0 on a line of its own, when this medicine already has one, belongs to another
      // row (tilted paper splits table rows). Never merge it into this medicine.
      if (hasDosePattern(line) && cur.lines.some(hasDosePattern)) {
        cur = null;
        continue;
      }
      cur.lines.push(line); // instruction lines under the medicine
    }
  }

  return items.map(({ form, lines: ls }) => {
    const { name, strength, rest } = parseNameLine(ls[0], form);
    const instr = parseInstructions([rest, ...ls.slice(1)].join(' '), form);
    const warnings = [...instr.warnings];
    if (name.length < 3) warnings.unshift("Couldn't read the medicine name.");
    if (!strength && form !== 'ml') warnings.unshift('Strength not found — check the prescription.');
    if (instr.doses.length && !hasDosePattern(rest) && ls.slice(1).some(hasDosePattern)) {
      warnings.push('How often was read from the next line — check it is for this medicine.');
    }
    return {
      id: makeId(),
      name,
      strength,
      unit: form,
      aliases: [],
      barcodes: [],
      source: ls.join('\n'),
      ...instr,
      warnings,
    };
  });
}

/** Does this text hold a 1-0-1 style timing (or OD/BD/TDS…)? */
function hasDosePattern(text: string): boolean {
  const t = ` ${text.toLowerCase().replace(/[–—]/g, '-')} `;
  return (
    /(?:^|[\s(])[0-9½¼ilo|]\s*-\s*[0-9½¼ilo|]\s*-\s*[0-9½¼ilo|](?=[\s),-]|$)/.test(t) ||
    /\b(qid|tds|tid|bd|bid|od|hs|thrice|twice|once)\b/.test(t)
  );
}

// ---------- US pharmacy directions ("TAKE 1 TABLET BY MOUTH TWICE DAILY") ----------

const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, half: 0.5, '1/2': 0.5, '½': 0.5 };

/**
 * Dose times from the directions on a US prescription bottle, as a draft for a person to check.
 * US wording is turned into the notation parseInstructions reads ("every 12 hours" → twice a day, "every night" →
 * at dinner), and the amount per dose ("take 2 tablets") is applied. "As needed" gives no reminders.
 */
export function parseUsDirections(text: string, unit: string): { doses: DraftDose[]; asNeeded: boolean; durationDays?: number; warnings: string[] } {
  const t = ` ${text.toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ')} `;
  const norm = t
    .replace(/\b(every|q)\s*24\s*(hours|hrs|h)\b/g, ' once daily ')
    .replace(/\b(every|q)\s*12\s*(hours|hrs|h)\b/g, ' twice ')
    .replace(/\b(every|q)\s*8\s*(hours|hrs|h)\b/g, ' three times ')
    .replace(/\b(every|q)\s*6\s*(hours|hrs|h)\b/g, ' four times ')
    .replace(/\b(qhs|at bedtime|before bed|every night at bedtime|nightly at bedtime)\b/g, ' bedtime ')
    .replace(/\b(every night|at night|nightly|every evening|in the evening)\b/g, ' once daily night ')
    .replace(/\b(every morning|in the morning|each morning)\b/g, ' once daily morning ')
    .replace(/\b(every day|each day|a day|per day)\b/g, ' daily ');
  const r = parseInstructions(norm, unit);
  const qm = /\b(?:take|inhale|use|give|chew|place|instill|spray)\s+(1\/2|½|\d+(?:\.\d+)?|one|two|three|four|half|1\/2|½)\s*(?:tablets?|tabs?|capsules?|caps?|puffs?|inhalations?|sprays?|drops?|ml|pills?)?\b/.exec(t);
  const per = qm ? (WORD_NUM[qm[1]] ?? parseFloat(qm[1])) : 1;
  if (r.asNeeded) {
    return { doses: [], asNeeded: true, warnings: ['Taken only when needed — no reminder times were set.'] };
  }
  const doses = unit === 'ml' ? r.doses : r.doses.map((d) => ({ ...d, qty: d.qty * per }));
  // US labels seldom say before or after food; the default (after) isn't worth a warning.
  return { doses, asNeeded: false, durationDays: r.durationDays, warnings: r.warnings.filter((w) => !/before or after food/i.test(w)) };
}
