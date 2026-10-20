// The app's copy of the US list (src/data/us-medicines.ts), looked up only by NDC. See docs/specs/18-us-medicine-list.md.
import { US_MEDICINES } from './data/us-medicines.ts';
import { lookupUs, type UsMedicine } from './uslist.ts';
import type { LabelResult } from './label.ts';

/** A US product from a scanned barcode, or from text that prints "NDC 0781-7296-85". */
export function findUsMedicine(codeOrText: string): UsMedicine | undefined {
  return US_MEDICINES.ndc ? lookupUs(US_MEDICINES, codeOrText) : undefined;
}

export const usListBuilt = () => US_MEDICINES.built;

/** A Scan to add draft from a US product. A person still checks it against the box. */
export function usDraft(m: UsMedicine, barcode?: string): LabelResult {
  const ingredients = m.contents.split(/\s*\+\s*/).filter(Boolean).map((name) => ({ name }));
  const generic = `${m.contents} ${m.strength}`.trim();
  return {
    name: m.name,
    strength: m.strength,
    unit: m.unit,
    aliases: m.contents && m.contents.toLowerCase() !== m.name.toLowerCase() ? [generic] : [],
    barcodes: barcode ? [barcode] : [],
    ingredients,
    contents: m.contents,
    brand: m.name,
    nameOptions: [],
  };
}
