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

// Rows as the phone reads Bijan's "My daily medicines" chart (time column merged with the medicine column).
const CHART = `MY DAILY MEDICINES
Bijan Kumar Pani - from 9 October 2026
Date: ___/___/____
MORNING
TIME   WHAT TO TAKE   DONE
7:00 AM   Thyroxin 50 mcg
Take with water only. Nothing else with it - no tea, no food, no
other tablet.
7:45 AM   Tide 20 mg
Ismo / Monotrate 10 mg
Before breakfast.
8:00 AM   BREAKFAST
Tea only after food, and keep it weak and small.
8:30 AM   Vonasec 20
Cordarone 200 mg
Check your pulse first. If it is below 60, do not take the
Cordarone - take the Vonasec and check again at 9:00 PM.
9:15 AM   Sucrafil syrup - 10 ml (2 tsp)
1st of 4 doses today. Use the cap measure.
AFTERNOON
TIME   WHAT TO TAKE   DONE
12:00 - 2:00 PM   LUNCH
Eat in 2 or 3 small portions, about 40 minutes apart. Stay sitting up -
do not lie down.
2:00 PM   Ismo / Monotrate 10 mg
Clopilet / Plavix 75 mg
At the end of lunch, with food.
2:15 PM   Sucrafil syrup - 10 ml (2 tsp)
2nd of 4 doses today.`;

test('daily medicine chart: times column + what-to-take column', () => {
  const items = parsePrescription(CHART.split('\n'), id);
  const by = Object.fromEntries(items.map((i) => [i.name, i]));
  assert.deepEqual(Object.keys(by).sort(), ['Clopilet', 'Cordarone', 'Ismo', 'Sucrafil', 'Thyroxin', 'Tide', 'Vonasec']);
  const times = (n: string) => by[n].doses.map((d) => (d.timing.kind === 'custom' ? d.timing.time : '?'));

  assert.equal(by.Thyroxin.strength, '50 mcg');
  assert.deepEqual(times('Thyroxin'), ['07:00']);
  assert.match(by.Thyroxin.notes ?? '', /water only/);

  assert.deepEqual(times('Tide'), ['07:45']);
  assert.equal(by.Tide.strength, '20');

  assert.deepEqual(times('Ismo'), ['07:45', '14:00']); // same medicine twice a day → one entry, two times
  assert.deepEqual(by.Ismo.aliases, ['Monotrate 10']);

  assert.deepEqual(times('Vonasec'), ['08:30']);
  assert.equal(by.Vonasec.strength, '20');
  assert.match(by.Cordarone.notes ?? '', /pulse/);
  assert.ok(by.Cordarone.warnings.some((w) => w.includes('special instruction')));

  assert.equal(by.Sucrafil.unit, 'ml');
  assert.equal(by.Sucrafil.doses[0].qty, 10);
  assert.deepEqual(times('Sucrafil'), ['09:15', '14:15']);

  assert.deepEqual(times('Clopilet'), ['14:00']);
  assert.deepEqual(by.Clopilet.aliases, ['Plavix 75']);
  assert.equal(by.Clopilet.strength, '75');
});

test('clock parsing', async () => {
  const { parseClock } = await import('../src/rx.ts');
  assert.deepEqual(parseClock('7:45 AM Tide 20 mg'), { time: '07:45', rest: 'Tide 20 mg' });
  assert.equal(parseClock('2:15 PM')?.time, '14:15');
  assert.equal(parseClock('12:00 - 2:00 PM LUNCH')?.time, '12:00');
  assert.equal(parseClock('12:30 AM')?.time, '00:30');
  assert.equal(parseClock('9 PM')?.time, '21:00');
  assert.equal(parseClock('20 mg'), undefined);
});
