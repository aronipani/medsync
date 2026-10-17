import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASK_DOCTOR_LINE, differenceMessage, exchangeable, formOf, genericLine, substituteCard } from '../src/substitute.ts';

const p = (name: string, strength: string, extra: { aliases?: string[]; unit?: string; printed?: string } = {}) => ({ name, strength, ...extra });

test('two brands of clopidogrel 75 are the same medicine', () => {
  const c = exchangeable(p('Clopilet', '75'), p('Clopitab', '75 mg'));
  assert.equal(c.ok, true);
  assert.deepEqual(c.reasons, []);
  assert.equal(c.askBeforeSwap, false);
  const card = substituteCard(c, p('Clopilet', '75'), p('Clopitab', '75'), 'Papa');
  assert.equal(card.title, "Different brand of Papa's Clopilet 75?");
  assert.deepEqual(card.strip, { name: 'Clopitab 75', generic: 'clopidogrel 75 mg' });
  assert.equal(card.yes, 'Yes, the pharmacy gave this');
});

test('a different strength is not the same, and says so', () => {
  const usual = p('Clopilet', '75');
  const strip = p('Clopitab', '150');
  const c = exchangeable(usual, strip);
  assert.equal(c.ok, false);
  assert.deepEqual(c.reasons, ['strength']);
  assert.equal(differenceMessage(c, usual, strip, 'Papa'), 'This is clopidogrel 150 mg. Papa takes 75.');
  assert.equal(exchangeable(p('Telma', '40'), p('Telmikind', '40.0 mg')).ok, true);
});

test('a combination with an extra ingredient is not the same', () => {
  const usual = p('Clopilet', '75');
  const strip = p('Clopitab A', '75/75');
  const c = exchangeable(usual, strip);
  assert.equal(c.ok, false);
  assert.deepEqual(c.reasons, ['extraIngredient']);
  assert.deepEqual(c.extra, ['Aspirin']);
  assert.equal(differenceMessage(c, usual, strip, 'Papa'), "This also contains aspirin. Papa's Clopilet has only clopidogrel.");
  // …and the other way round
  const back = exchangeable(strip, usual);
  assert.deepEqual(back.reasons, ['missingIngredient']);
  assert.equal(differenceMessage(back, strip, usual), "This doesn't have aspirin. Your Clopitab A has it too.");
});

test('an ingredient read from the strip text counts too', () => {
  const c = exchangeable(p('Clopilet', '75'), p('Plagerine A', '75/75', { printed: 'Clopidogrel 75 mg and Aspirin 75 mg tablets' }));
  assert.deepEqual(c.reasons, ['extraIngredient']);
});

test('slow-release and plain are not the same', () => {
  assert.equal(formOf(p('Isoket SR', '20')), 'SR');
  assert.equal(formOf(p('Isoket', '10')), undefined);
  assert.equal(formOf(p('Sorbitrate', '10', { printed: 'Isosorbide Dinitrate Sustained Release Tablets' })), 'SR');
  const c = exchangeable(p('Sorbitrate', '10'), p('Isoket SR', '10'));
  assert.equal(c.ok, false);
  assert.deepEqual(c.reasons, ['form']);
  assert.equal(differenceMessage(c, p('Sorbitrate', '10'), p('Isoket SR', '10'), 'Papa'), "This is the slow-release (SR) kind. Papa's Sorbitrate is the plain kind.");
});

test("a maker's name with Dr. doesn't make a strip delayed-release", () => {
  assert.equal(formOf(p('Clopitab', '75', { printed: "Clopidogrel 75 mg Mfd by Dr. Reddy's Laboratories" })), undefined);
  assert.equal(exchangeable(p('Clopilet', '75'), p('Clopitab', '75', { printed: "Dr. Reddy's" })).ok, true);
});

test('metoprolol tartrate and succinate (XL) are not the same', () => {
  const c = exchangeable(p('Metolar', '25'), p('Met XL', '25'));
  assert.equal(c.ok, false);
  assert.deepEqual(c.reasons, ['form', 'salt']);
  assert.deepEqual(c.salt, { usual: 'tartrate', strip: 'succinate' });
  assert.equal(exchangeable(p('Met XL', '25'), p('Starpress XL', '25')).ok, true);
});

test('when the salt matters and is unknown, ask', () => {
  const c = exchangeable(p('Metolar', '25'), p('Metoprolol', '25'));
  assert.equal(c.ok, false);
  assert.deepEqual(c.unknown, ['salt']);
  assert.equal(differenceMessage(c, p('Metolar', '25'), p('Metoprolol', '25'), 'Papa'), "Can't tell if this is the same as Papa's Metolar 25.");
  assert.equal(exchangeable(p('Metolar', '25'), p('Metoprolol Tartrate', '25')).ok, true);
});

test('unknown contents or strength are never the same', () => {
  const c = exchangeable(p('Clopilet', '75'), p('Zorbix', '75'));
  assert.equal(c.ok, false);
  assert.deepEqual(c.unknown, ['contents']);
  const s = exchangeable(p('Clopilet', '75'), p('Clopitab', ''));
  assert.deepEqual(s.unknown, ['strength']);
  assert.equal(s.ok, false);
});

test('a different medicine altogether', () => {
  const c = exchangeable(p('Clopilet', '75'), p('Ecosprin', '75'));
  assert.deepEqual(c.reasons, ['contents']);
  assert.equal(differenceMessage(c, p('Clopilet', '75'), p('Ecosprin', '75'), 'Papa'), "This is aspirin, not Papa's Clopilet 75.");
});

test('tablet and capsule are not the same', () => {
  const c = exchangeable(p('Clopilet', '75', { unit: 'tablet' }), p('Clopitab', '75', { unit: 'capsules' }));
  assert.deepEqual(c.reasons, ['unit']);
  assert.equal(exchangeable(p('Clopilet', '75', { unit: 'tablet' }), p('Clopitab', '75', { unit: 'Tablets' })).ok, true);
});

test('amiodarone is recognised but the doctor should agree first', () => {
  const c = exchangeable(p('Cordarone X', '200', { aliases: ['Amiodarone 200'] }), p('Tachyra', '200'));
  assert.equal(c.ok, true);
  assert.equal(c.askBeforeSwap, true);
  const card = substituteCard(c, p('Cordarone X', '200'), p('Tachyra', '200'));
  assert.equal(card.note, ASK_DOCTOR_LINE);
  assert.equal(card.yes, 'Doctor said it’s fine');
  assert.equal(exchangeable(p('Thyronorm', '50'), p('Eltroxin', '50 mcg')).askBeforeSwap, true);
});

test('generic line for combinations', () => {
  assert.equal(genericLine(['Telmisartan', 'Hydrochlorothiazide'], '40/12.5'), 'telmisartan 40 + hydrochlorothiazide 12.5');
  assert.equal(genericLine(['Clopidogrel'], '75 mg'), 'clopidogrel 75 mg');
});
