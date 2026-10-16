// Adding photos for training from the phone's library (e.g. strip photos friends sent): each photo is scanned like a
// live scan (so it keeps the scan trace, spec 12) and saved labelled with the medicine the person says it shows,
// along with whether the scanner recognised it. Pure — no React Native — so it can be unit tested. See spec 13.

import { matchText } from './match.ts';

export type ImportScan = 'recognised' | 'name only' | 'not recognised';

export interface ImportLabel {
  name: string;
  strength: string;
}

/** Would the scanner have recognised this strip as the medicine the person says it is? */
export function judgeImport(text: string, label: ImportLabel): ImportScan {
  const m = matchText(text, { name: label.name, strength: label.strength, aliases: [] });
  if (m.matched) return 'recognised';
  return m.nameFound ? 'name only' : 'not recognised';
}

/** "Name 10" typed in one field → name and strength; a trailing number (with optional unit) is the strength. */
export function parseTypedLabel(name: string, strength: string): ImportLabel | null {
  let n = name.trim().replace(/\s+/g, ' ');
  let s = strength.trim();
  if (!s) {
    const m = n.match(/^(.*?)\s+(\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)*)\s*(mg|mcg|g|ml|iu)?$/i);
    if (m) [n, s] = [m[1], m[2]];
  }
  s = s.replace(/\s*(mg|mcg|ml|iu)$/i, '').trim();
  return n.length >= 2 ? { name: n, strength: s } : null;
}

export function importSummary(results: ImportScan[]): string {
  const n = (k: ImportScan) => results.filter((r) => r === k).length;
  const parts = [`${n('recognised')} recognised`];
  if (n('name only')) parts.push(`${n('name only')} name only (strength not read)`);
  if (n('not recognised')) parts.push(`${n('not recognised')} not recognised`);
  return `${results.length} photo${results.length === 1 ? '' : 's'} saved · scanner: ${parts.join(', ')}`;
}
