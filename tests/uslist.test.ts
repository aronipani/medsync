// US medicine list (spec 18): built from the FDA NDC Directory, looked up only by NDC.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildUsList, lookupUs, ndcCandidates, strengthFor, unitFor, usText } from '../src/uslist.ts';

const P = ['PRODUCTID', 'PRODUCTNDC', 'PRODUCTTYPENAME', 'PROPRIETARYNAME', 'PROPRIETARYNAMESUFFIX', 'NONPROPRIETARYNAME', 'DOSAGEFORMNAME', 'ROUTENAME',
  'STARTMARKETINGDATE', 'ENDMARKETINGDATE', 'MARKETINGCATEGORYNAME', 'APPLICATIONNUMBER', 'LABELERNAME', 'SUBSTANCENAME', 'ACTIVE_NUMERATOR_STRENGTH',
  'ACTIVE_INGRED_UNIT', 'PHARM_CLASSES', 'DEASCHEDULE', 'NDC_EXCLUDE_FLAG', 'LISTING_RECORD_CERTIFIED_THROUGH'];
const row = (o: Record<string, string>) => P.map((c) => o[c] ?? '').join('\t');
const products = [
  P.join('\t'),
  row({ PRODUCTID: 'a1', PRODUCTNDC: '0781-7296', PRODUCTTYPENAME: 'HUMAN PRESCRIPTION DRUG', PROPRIETARYNAME: 'Albuterol Sulfate', NONPROPRIETARYNAME: 'Albuterol Sulfate',
    DOSAGEFORMNAME: 'AEROSOL, METERED', ROUTENAME: 'RESPIRATORY (INHALATION)', LABELERNAME: 'Sandoz Inc', SUBSTANCENAME: 'ALBUTEROL SULFATE', ACTIVE_NUMERATOR_STRENGTH: '90', ACTIVE_INGRED_UNIT: 'ug/1', NDC_EXCLUDE_FLAG: 'N' }),
  row({ PRODUCTID: 'a2', PRODUCTNDC: '59310-579', PRODUCTTYPENAME: 'HUMAN PRESCRIPTION DRUG', PROPRIETARYNAME: 'ProAir', PROPRIETARYNAMESUFFIX: 'HFA', NONPROPRIETARYNAME: 'Albuterol Sulfate',
    DOSAGEFORMNAME: 'AEROSOL, METERED', ROUTENAME: 'RESPIRATORY (INHALATION)', LABELERNAME: 'Teva Respiratory, LLC', SUBSTANCENAME: 'ALBUTEROL SULFATE', ACTIVE_NUMERATOR_STRENGTH: '90', ACTIVE_INGRED_UNIT: 'ug/1' }),
  row({ PRODUCTID: 'c1', PRODUCTNDC: '0093-7368', PRODUCTTYPENAME: 'HUMAN PRESCRIPTION DRUG', PROPRIETARYNAME: 'AMLODIPINE AND BENAZEPRIL HYDROCHLORIDE', NONPROPRIETARYNAME: 'Amlodipine and Benazepril Hydrochloride',
    DOSAGEFORMNAME: 'CAPSULE', ROUTENAME: 'ORAL', LABELERNAME: 'TEVA PHARMACEUTICALS USA, INC.', SUBSTANCENAME: 'AMLODIPINE BESYLATE; BENAZEPRIL HYDROCHLORIDE', ACTIVE_NUMERATOR_STRENGTH: '5; 10', ACTIVE_INGRED_UNIT: 'mg/1; mg/1' }),
  row({ PRODUCTID: 's1', PRODUCTNDC: '11111-222', PRODUCTTYPENAME: 'HUMAN OTC DRUG', PROPRIETARYNAME: 'Sun Guard SPF 50', NONPROPRIETARYNAME: 'Avobenzone',
    DOSAGEFORMNAME: 'LOTION', ROUTENAME: 'TOPICAL', LABELERNAME: 'Beach Co', SUBSTANCENAME: 'AVOBENZONE', ACTIVE_NUMERATOR_STRENGTH: '3', ACTIVE_INGRED_UNIT: 'g/100mL' }),
  row({ PRODUCTID: 't1', PRODUCTNDC: '50580-449', PRODUCTTYPENAME: 'HUMAN OTC DRUG', PROPRIETARYNAME: 'Tylenol Extra Strength', NONPROPRIETARYNAME: 'Acetaminophen',
    DOSAGEFORMNAME: 'TABLET, COATED', ROUTENAME: 'ORAL', LABELERNAME: 'Kenvue Brands LLC', SUBSTANCENAME: 'ACETAMINOPHEN', ACTIVE_NUMERATOR_STRENGTH: '500', ACTIVE_INGRED_UNIT: 'mg/1' }),
  row({ PRODUCTID: 'x1', PRODUCTNDC: '22222-333', PRODUCTTYPENAME: 'HUMAN PRESCRIPTION DRUG', PROPRIETARYNAME: 'Oldmed', NONPROPRIETARYNAME: 'Oldine',
    DOSAGEFORMNAME: 'TABLET', ROUTENAME: 'ORAL', ENDMARKETINGDATE: '20200101', LABELERNAME: 'Gone Inc', SUBSTANCENAME: 'OLDINE', ACTIVE_NUMERATOR_STRENGTH: '10', ACTIVE_INGRED_UNIT: 'mg/1' }),
  row({ PRODUCTID: 'v1', PRODUCTNDC: '33333-444', PRODUCTTYPENAME: 'HUMAN PRESCRIPTION DRUG', PROPRIETARYNAME: 'Vaccine X', NONPROPRIETARYNAME: 'Vaccine',
    DOSAGEFORMNAME: 'INJECTION', ROUTENAME: 'INTRAMUSCULAR', LABELERNAME: 'Vax', SUBSTANCENAME: '', ACTIVE_NUMERATOR_STRENGTH: '', ACTIVE_INGRED_UNIT: '' }),
].join('\r\n');
const K = ['PRODUCTID', 'PRODUCTNDC', 'NDCPACKAGECODE', 'PACKAGEDESCRIPTION', 'STARTMARKETINGDATE', 'ENDMARKETINGDATE', 'NDC_EXCLUDE_FLAG', 'SAMPLE_PACKAGE'];
const pk = (id: string, code: string, extra: Partial<Record<string, string>> = {}) => K.map((c) => ({ PRODUCTID: id, NDCPACKAGECODE: code, ...extra } as Record<string, string>)[c] ?? '').join('\t');
const packages = [K.join('\t'), pk('a1', '0781-7296-85'), pk('a2', '59310-579-22'), pk('a2', '59310-579-99', { SAMPLE_PACKAGE: 'Y' }), pk('c1', '0093-7368-01'),
  pk('s1', '11111-222-01'), pk('t1', '50580-449-10'), pk('x1', '22222-333-01'), pk('v1', '33333-444-01')].join('\n');

const { list, stats } = buildUsList(products, packages, 'test', '2026-10-20');

test('builds from FDA rows: prescription and swallowed/inhaled OTC kept, sunscreen, ended, samples and no-strength dropped', () => {
  assert.equal(stats.kept.packages, 4);
  assert.equal(stats.skipped.otcRoute, 1);
  assert.equal(stats.skipped.ended, 1);
  assert.equal(stats.skipped.sample, 1);
  assert.equal(stats.skipped.noStrength, 1);
});

test('the Sandoz albuterol box: barcode, DataMatrix and printed NDC all find it', () => {
  const upc = '3' + '0781729685' + '0'; // UPC-A: 3 + NDC10 + check digit
  for (const code of [upc, `(01)00${upc}`, 'NDC 0781-7296-85', 'Rx only\nNDC 00781-7296-85']) {
    const m = lookupUs(list, code);
    assert.ok(m, code);
    assert.equal(m.name, 'Albuterol');
    assert.equal(m.contents, 'Albuterol');
    assert.equal(m.strength, '90 mcg');
    assert.equal(m.unit, 'puff');
    assert.equal(m.maker, 'Sandoz Inc');
  }
});

test('brands keep their printed name; generics are named by their contents; combinations', () => {
  assert.equal(lookupUs(list, 'NDC 59310-579-22')?.name, 'ProAir HFA');
  const combo = lookupUs(list, 'NDC 0093-7368-01');
  assert.equal(combo?.name, 'Amlodipine + Benazepril');
  assert.equal(combo?.strength, '5/10 mg');
  assert.equal(combo?.unit, 'capsule');
  assert.equal(lookupUs(list, 'NDC 50580-449-10')?.name, 'Tylenol Extra Strength');
  assert.equal(lookupUs(list, 'NDC 11111-222-01'), undefined); // sunscreen left out
  assert.equal(lookupUs(list, 'NDC 59310-579-99'), undefined); // sample pack
});

test('only an NDC finds a product: Indian strip text and Indian barcodes never do', () => {
  assert.equal(lookupUs(list, 'Albuterol Sulfate 90 mcg'), undefined);
  assert.equal(lookupUs(list, '8901234567890'), undefined); // India GS1 prefix 890
  assert.deepEqual(ndcCandidates('Asthalin 100 mcg\nMfg. Lic. No. 12-345-67'), []);
});

test('a US product checks like a read strip: name and strength', async () => {
  const { matchText } = await import('../src/match.ts');
  const m = lookupUs(list, 'NDC 0781-7296-85')!;
  assert.equal(matchText(usText(m), { name: 'Albuterol', strength: '90 mcg', aliases: [] }).matched, true);
  assert.equal(matchText(usText(m), { name: 'Albuterol', strength: '100 mcg', aliases: [] }).matched, false);
});

test('strengths and units', () => {
  assert.equal(strengthFor('100', 'mg/5mL'), '100 mg/5 mL');
  assert.equal(strengthFor('0.50', 'mg/1'), '0.5 mg');
  assert.equal(strengthFor('25; 1000', 'mg/1; mg/1'), '25/1000 mg');
  assert.equal(unitFor('SPRAY, METERED', 'NASAL'), 'puff');
  assert.equal(unitFor('SOLUTION/ DROPS', 'OPHTHALMIC'), 'drops');
  assert.equal(unitFor('TABLET, FILM COATED', 'ORAL'), 'tablet');
});

test('a changed FDA format stops the build', () => {
  assert.throws(() => buildUsList('PRODUCTID\tNAME\n1\tx', packages, 't', '2026-10-20'), /missing columns/);
});
