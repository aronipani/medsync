import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buyItem, buyList, hardToFind, itemLine, leadDays, needsBuying, pharmacyMessage, pharmacyOrder, pickups, smsLink, whatsappLink, whatsappNumber, withAnswer } from '../src/buylist.ts';
import type { AppState, Medication } from '../src/types.ts';

const now = new Date('2026-10-16T10:00:00');
let n = 0;
const dose = (qty = 1, days: number[] = []) => ({ id: `d${++n}`, timing: { kind: 'custom' as const, time: '09:00' }, qty, days, since: '2026-01-01T00:00:00.000Z' });
const med = (name: string, strength: string, stock: number, extra: Partial<Medication> = {}): Medication => ({
  id: `m${++n}`, memberId: 'ma', name, strength, aliases: [], barcodes: [], unit: 'tablet', doses: [dose()], stock, lowStockAt: 3,
  active: true, createdAt: '2026-10-01T00:00:00.000Z', ...extra,
});
const state = (meds: Medication[], pharmacies = [{ id: 'p1', name: 'Apollo', phone: '98300 12345', whatsapp: true }, { id: 'p2', name: 'Frank Ross', phone: '033 2222 3333' }]): AppState =>
  ({ version: 1, members: [], meds, logs: [], stock: [], settings: {} as AppState['settings'], pharmacies });

test('time to buy: 7 days before running out, 14 when hard to find', () => {
  assert.equal(needsBuying(med('Clopilet', '75', 7), now), true);
  assert.equal(needsBuying(med('Clopilet', '75', 8), now), false);
  const hard = med('Cordarone X', '200', 12, {
    found: [
      { pharmacyId: 'p1', answer: 'no', at: '2026-09-20T10:00:00.000Z' },
      { pharmacyId: 'p2', answer: 'no', at: '2026-09-20T11:00:00.000Z' },
    ],
  });
  assert.equal(hardToFind(hard, now), true);
  assert.equal(leadDays(hard, now), 14);
  assert.equal(needsBuying(hard, now), true);
  // Same pharmacy saying no twice isn't "hard to find"; old answers don't count.
  assert.equal(hardToFind(med('X', '1', 5, { found: [{ pharmacyId: 'p1', answer: 'no', at: '2026-09-20T10:00:00.000Z' }, { pharmacyId: 'p1', answer: 'no', at: '2026-09-21T10:00:00.000Z' }] }), now), false);
  assert.equal(hardToFind(med('X', '1', 5, { found: [{ pharmacyId: 'p1', answer: 'order', at: '2026-05-01T10:00:00.000Z' }] }), now), false);
  assert.equal(needsBuying(med('Clopilet', '75', 20, { buyLeadDays: 21 }), now), true);
});

test('a course that ends before the strip runs out, or a stopped medicine, needs nothing', () => {
  assert.equal(needsBuying(med('Augmentin', '625', 4, { endDate: '2026-10-18' }), now), false);
  assert.equal(needsBuying(med('Clopilet', '75', 2, { active: false }), now), false);
});

test('two a day for 30 days; half tablets round up; weekday doses count their share', () => {
  assert.equal(buyItem(med('Tide', '10', 2, { doses: [dose(), dose()] }), now).qty, 60);
  assert.equal(buyItem(med('Nebicard', '2.5', 2, { doses: [dose(0.5)] }), now).qty, 15);
  assert.equal(buyItem(med('Uprise D3', '60K', 0, { unit: 'capsule', doses: [dose(1, [0])] }), now).qty, 5);
});

test('the line asks by contents, lists brands already confirmed, and says "only" where the doctor must agree', () => {
  const clo = buyItem(med('Clopilet', '75', 3, { aliases: ['Clopidogrel 75', 'Clopitab 75', 'Clopitab A 75'] }), now);
  assert.equal(clo.ask, 'Clopidogrel 75 mg tablet');
  assert.deepEqual(clo.brands, ['Clopilet 75', 'Clopitab 75']);
  assert.equal(itemLine(clo), 'Clopidogrel 75 mg tablet × 30 (Clopilet 75 / Clopitab 75 are fine)');
  const amio = buyItem(med('Cordarone X', '200', 3, { aliases: ['Tachyra 200'] }), now);
  assert.equal(amio.only, true);
  assert.equal(itemLine(amio), 'Amiodarone 200 mg tablet × 30 (Cordarone X 200 only)');
  const unknown = buyItem(med('Zorbix', '5', 3), now);
  assert.equal(itemLine(unknown), 'Zorbix 5 × 30 (Zorbix 5 is fine)');
  const syrup = buyItem(med('Sucrafil', '', 50, { unit: 'ml', doses: [dose(10), dose(10)] }), now);
  assert.equal(itemLine(syrup), 'Sucralfate × 600 ml (Sucrafil is fine)');
});

test('message, links and number formats', () => {
  const items = buyList(state([med('Clopilet', '75', 3), med('Telma', '40', 30)]), now);
  assert.equal(items.length, 1);
  assert.equal(pharmacyMessage(items), 'Namaste, do you have these medicines?\n• Clopidogrel 75 mg tablet × 30 (Clopilet 75 is fine)\nPlease tell me the price, and if you can deliver. Thank you.');
  assert.equal(whatsappNumber('98300 12345'), '919830012345');
  assert.equal(whatsappNumber('+91 98300-12345'), '919830012345');
  assert.equal(whatsappNumber('098300 12345'), '919830012345');
  assert.match(whatsappLink('98300 12345', 'Hi there'), /^https:\/\/wa\.me\/919830012345\?text=Hi%20there$/);
  assert.equal(smsLink('033 2222 3333', 'a b', true), 'sms:03322223333&body=a%20b');
  assert.equal(smsLink('033 2222 3333', 'a b', false), 'sms:03322223333?body=a%20b');
});

test('the pharmacy that had it last time comes first; answers are remembered', () => {
  let m = med('Clopilet', '75', 3);
  m = withAnswer(m, 'p2', 'has', new Date('2026-09-15T10:00:00'));
  const s = state([m]);
  assert.deepEqual(pharmacyOrder(s.pharmacies!, buyList(s, now)).map((p) => p.name), ['Frank Ross', 'Apollo']);
  for (let i = 0; i < 10; i++) m = withAnswer(m, 'p1', 'no', now);
  assert.equal(m.found!.length, 8);
  const item = buyItem(m, now);
  assert.equal(item.lastHad, undefined); // pushed out by newer answers
  assert.equal(item.hard, false); // only one pharmacy said no
});

test('an order to collect: shown on the item and as a pickup until bought', () => {
  const m = withAnswer(med('Cordarone X', '200', 4), 'p1', 'order', now, '2026-10-18');
  const s = state([m]);
  const [item] = buyList(s, now);
  assert.equal(item.ordered?.readyOn, '2026-10-18');
  assert.equal(item.hard, true);
  const [p] = pickups(s, now);
  assert.equal(p.pharmacy.name, 'Apollo');
  assert.equal(p.date, '2026-10-18');
  assert.deepEqual(pickups(state([{ ...m, stock: 60 }]), now), []);
});
