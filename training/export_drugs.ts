// Writes training/drugs.json from the app's built-in medicine list (run: node --experimental-strip-types training/export_drugs.ts)
import { writeFileSync } from 'node:fs';
import { DRUGS } from '../src/drugdb.ts';
writeFileSync(new URL('./drugs.json', import.meta.url).pathname, JSON.stringify(DRUGS, null, 1));
console.log(`wrote ${DRUGS.length} entries`);
