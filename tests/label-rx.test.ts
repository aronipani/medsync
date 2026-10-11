import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLabel } from '../src/label.ts';
import { parsePrescription } from '../src/rx.ts';

let n = 0;
const id = () => `i${n++}`;

test('strip: brand, strength and generic from prominent text', () => {
  const r = parseLabel([
    { text: 'Paracetamol Tablets IP 650 mg', height: 18 },
    { text: 'DOLO-650', height: 60 },
    { text: 'Micro Labs Limited', height: 14 },
    { text: 'B.No. DOBS1234 Exp. 04/2028', height: 12 },
  ]);
  assert.equal(r.name, 'Dolo');
  assert.equal(r.strength, '650');
  assert.equal(r.unit, 'tablet');
  assert.deepEqual(r.aliases, ['Paracetamol 650']);
});

test('bottle without text sizes: composition and microgram strength', () => {
  const r = parseLabel([
    { text: 'Thyronorm' },
    { text: '50 mcg' },
    { text: 'Thyroxine Sodium Tablets IP' },
    { text: 'Each uncoated tablet contains: Thyroxine Sodium IP 50 mcg' },
    { text: 'Abbott India Ltd' },
  ], '8901234567890');
  assert.equal(r.name, 'Thyronorm');
  assert.equal(r.strength, '50 mcg');
  assert.ok(r.aliases.some((a) => a.includes('Thyroxine Sodium 50 mcg')));
  assert.deepEqual(r.barcodes, ['8901234567890']);
});

test('syrup bottle sets ml as the unit', () => {
  const r = parseLabel([{ text: 'Ascoril LS', height: 40 }, { text: 'Syrup 100 ml', height: 20 }]);
  assert.equal(r.name, 'Ascoril LS');
  assert.equal(r.unit, 'ml');
});

const RX = `Dr. A. Sen MBBS MD
Reg No 12345
Patient: Mrs. S. Pani   Age 72
Rx
1. Tab. Telma 40 mg   1-0-0  before food  x 30 days
2. Tab Dolo 650   1-0-1 after food x 5 days
3. Cap. Pan-D 40  OD empty stomach
4. Tab Thyronorm 50mcg  1 tab daily morning before breakfast
5. Syp. Ascoril LS  5 ml TDS x 5 days
6. Tab. Atorva 10 HS
7. Cap Uprise D3 60K once a week x 8 weeks
8. Tab Ondem 4mg SOS
Advice: Plenty of fluids. Review after 1 week.`;

test('prescription: medicines, frequencies, food timing and duration', () => {
  const items = parsePrescription(RX.split('\n'), id);
  assert.deepEqual(items.map((i) => i.name), ['Telma', 'Dolo', 'Pan D', 'Thyronorm', 'Ascoril LS', 'Atorva', 'Uprise D3', 'Ondem']);
  const [telma, dolo, pan, thyro, ascoril, atorva, d3, ondem] = items;

  assert.equal(telma.strength, '40');
  assert.equal(telma.doses.length, 1);
  assert.deepEqual(telma.doses[0].timing, { kind: 'meal', meal: 'breakfast', relation: 'before' });
  assert.equal(telma.durationDays, 30);

  assert.equal(dolo.strength, '650');
  assert.deepEqual(dolo.doses.map((d) => d.timing.kind === 'meal' && d.timing.meal), ['breakfast', 'dinner']);
  assert.equal(dolo.durationDays, 5);

  assert.equal(pan.unit, 'capsule');
  assert.equal(pan.doses[0].timing.kind === 'meal' && pan.doses[0].timing.relation, 'before');

  assert.equal(thyro.strength, '50 mcg');
  assert.equal(thyro.doses.length, 1);

  assert.equal(ascoril.unit, 'ml');
  assert.equal(ascoril.doses.length, 3);
  assert.equal(ascoril.doses[0].qty, 5);

  assert.deepEqual(atorva.doses[0].timing, { kind: 'custom', time: '22:00' });

  assert.equal(d3.strength, '60K');
  assert.deepEqual(d3.doses[0].days, [0]);
  assert.equal(d3.durationDays, 56);
  assert.ok(d3.warnings.some((w) => w.includes('Weekly')));

  assert.equal(ondem.asNeeded, true);
  assert.equal(ondem.doses.length, 0);
});

test('half tablets, four-times-a-day and instructions on the next line', () => {
  const items = parsePrescription(['T. Glycomet GP 2   ½-0-½', 'after meals', 'C. Becosules 1-1-1-1'], id);
  assert.equal(items[0].name, 'Glycomet GP');
  assert.equal(items[0].doses[0].qty, 0.5);
  assert.equal(items[0].doses[0].timing.kind === 'meal' && items[0].doses[0].timing.relation, 'after');
  assert.ok(!items[0].warnings.some((w) => w.includes('food')));
  assert.equal(items[1].doses.length, 4);
});

test('flags what it could not read', () => {
  const [item] = parsePrescription(['Tab. Xyzzol as directed'], id);
  assert.ok(item.warnings.some((w) => w.includes('Strength')));
  assert.ok(item.warnings.some((w) => w.includes('how often')));
});

test('row merge joins table columns back into one line', async () => {
  const { mergeRows } = await import('../src/label.ts');
  const rows = mergeRows([
    { text: '1-0-1', top: 102, left: 300, height: 20 },
    { text: 'Tab Dolo 650', top: 100, left: 20, height: 22 },
    { text: 'after food', top: 101, left: 420, height: 20 },
    { text: 'Tab Telma 40', top: 140, left: 20, height: 22 },
    { text: '1-0-0', top: 142, left: 300, height: 20 },
  ]);
  assert.deepEqual(rows, ['Tab Dolo 650   1-0-1   after food', 'Tab Telma 40   1-0-0']);
  const items = parsePrescription(rows, id);
  assert.equal(items[0].doses.length, 2);
  assert.equal(items[1].doses.length, 1);
});
