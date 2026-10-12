import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPrescription, duplicateGroups, mergeGroup, planPrescription, remapLogs, reuseDoseIds, sameMedicine } from '../src/consolidate.ts';
import type { Dose, DoseLog, Medication } from '../src/types.ts';

const T0 = '2026-10-01T00:00:00.000Z';
const NOW = '2026-10-12T07:30:00.000Z';
const dose = (id: string, time: string, qty = 1): Dose => ({ id, timing: { kind: 'custom', time }, qty, days: [], since: T0 });
const med = (id: string, name: string, strength: string, doses: Dose[], extra: Partial<Medication> = {}): Medication => ({
  id, memberId: 'baba', name, strength, aliases: [], barcodes: [], unit: 'tablet', doses, stock: 10, lowStockAt: 3, active: true, createdAt: T0, ...extra,
});
const describe = (m: Medication) => m.doses.map((d) => `${d.timing.kind === 'custom' ? d.timing.time : '?'} x${d.qty}`).join(', ');

test('same medicine: by name, by alias, by contents; not combos vs singles', () => {
  assert.ok(sameMedicine({ name: 'Ismo', aliases: ['Monotrate 10'] }, { name: 'Monotrate', aliases: [] }));
  assert.ok(sameMedicine({ name: 'Clopilet', aliases: [] }, { name: 'Plavix', aliases: [] })); // same contents
  assert.ok(sameMedicine({ name: 'Clopidogrel', aliases: [] }, { name: 'Clopilet', aliases: [] }));
  assert.ok(!sameMedicine({ name: 'Cilacar', aliases: [] }, { name: 'Cilacar T', aliases: [] }));
  assert.ok(!sameMedicine({ name: 'Telma', aliases: [] }, { name: 'Tide', aliases: [] }));
});

test('new prescription: new, changed, unchanged and missing medicines', () => {
  const existing = [
    med('m1', 'Tide', '20', [dose('d1', '07:45')]),
    med('m2', 'Ismo', '10', [dose('d2', '07:45'), dose('d3', '14:00')], { aliases: ['Monotrate 10'] }),
    med('m3', 'Cordarone', '200', [dose('d4', '08:30')]),
  ];
  const drafts = [
    { id: 'a', med: med('n1', 'Tide', '40', [dose('x1', '07:45')]) }, // strength changed
    { id: 'b', med: med('n2', 'Monotrate', '10', [dose('x2', '07:45'), dose('x3', '14:00')]) }, // same (brand alias)
    { id: 'c', med: med('n3', 'Nebicard', '2.5', [dose('x4', '21:00', 0.5)]) }, // new
  ];
  const plan = planPrescription(existing, drafts, describe);
  assert.deepEqual(plan.items.map((i) => i.action), ['update', 'update', 'new']);
  assert.deepEqual(plan.items[0].diffs, ['Strength 20 → 40']);
  assert.deepEqual(plan.items[1].diffs, ['Name Ismo → Monotrate']);
  assert.deepEqual(plan.missing.map((m) => m.id), ['m3']); // Cordarone isn't on the new list

  const { meds, changes } = applyPrescription(existing, drafts, plan, ['m3'], NOW);
  assert.equal(meds.length, 4); // 3 existing (one stopped) + 1 new — no duplicates
  const tide = meds.find((m) => m.id === 'm1')!;
  assert.equal(tide.strength, '40');
  assert.equal(tide.stock, 10); // stock carried over
  assert.equal(tide.doses[0].id, 'd1'); // same time keeps the dose id, so today's "taken" still counts
  const ismo = meds.find((m) => m.id === 'm2')!;
  assert.equal(ismo.name, 'Monotrate');
  assert.ok(ismo.aliases.includes('Ismo 10'));
  assert.equal(meds.find((m) => m.id === 'm3')!.active, false);
  assert.deepEqual(changes.map((c) => c.kind), ['changed', 'changed', 'added', 'stopped']);
});

test('identical prescription scanned twice changes nothing', () => {
  const existing = [med('m1', 'Clopilet', '75', [dose('d1', '14:00')])];
  const drafts = [{ id: 'a', med: med('n1', 'Clopilet', '75', [dose('x1', '14:00')]) }];
  const plan = planPrescription(existing, drafts, describe);
  assert.equal(plan.items[0].action, 'same');
  const { meds, changes } = applyPrescription(existing, drafts, plan, [], NOW);
  assert.equal(meds.length, 1);
  assert.equal(changes.length, 0);
});

test('changed times: kept times keep their id, new times start from now', () => {
  const out = reuseDoseIds([dose('d1', '08:00'), dose('d2', '20:00')], [dose('x1', '08:00'), dose('x2', '14:00')], NOW);
  assert.equal(out[0].id, 'd1');
  assert.equal(out[0].since, T0);
  assert.equal(out[1].id, 'x2');
  assert.equal(out[1].since, NOW);
});

test('existing duplicates merge into one, with stock and taken logs kept', () => {
  const a = med('m1', 'Clopilet', '75', [dose('d1', '14:00')], { stock: 5, createdAt: '2026-10-01T00:00:00Z' });
  const b = med('m2', 'Clopilet', '75', [dose('e1', '14:00')], { stock: 15, createdAt: '2026-10-11T00:00:00Z' });
  const c = med('m3', 'Nebicard', '2.5', [dose('f1', '21:00')]);
  const groups = duplicateGroups([a, b, c]);
  assert.equal(groups.length, 1);
  const { med: merged, removed, remap } = mergeGroup(groups[0]);
  assert.equal(merged.id, 'm1');
  assert.equal(merged.stock, 20);
  assert.equal(merged.doses.length, 1);
  assert.deepEqual(removed, ['m2']);
  const log = (key: string, status: DoseLog['status']): DoseLog => ({ id: key, key, memberId: 'baba', medId: key.split('|')[1], medName: 'Clopilet 75', date: '2026-10-12', time: '14:00', status, method: 'manual', qty: 1, at: NOW });
  const logs = remapLogs([log('2026-10-12|m1|d1', 'missed'), log('2026-10-12|m2|e1', 'taken')], remap);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].key, '2026-10-12|m1|d1');
  assert.equal(logs[0].status, 'taken'); // the dose taken via the duplicate isn't shown as due again
});

test('same medicine at different strengths is not auto-merged', () => {
  assert.equal(duplicateGroups([med('m1', 'Telma', '40', []), med('m2', 'Telma', '20', [])]).length, 0);
});
