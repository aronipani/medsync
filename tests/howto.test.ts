import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { COLOUR_KEY, EXAMPLE_REMINDER, GUIDE, hasSpokenColours, spokenColour } from '../src/howto.ts';
import { LANGS, LANG_ORDER } from '../src/phrases.ts';

const read = (rel: string): string => readFileSync(fileURLToPath(new URL(rel, import.meta.url).href), 'utf8');

test('colour key: three colours, each with a symbol, words and what to do', () => {
  assert.deepEqual(COLOUR_KEY.map((r) => r.kind), ['go', 'check', 'stop']);
  for (const r of COLOUR_KEY) {
    assert.ok(r.symbol.trim().length > 0, `${r.kind} has a symbol`);
    assert.ok(r.title.length > 0 && r.meaning.length > 0);
  }
});

test('green says "Matches your list", never "correct" (store guideline 1.4.1)', () => {
  const green = COLOUR_KEY.find((r) => r.kind === 'go')!;
  assert.equal(green.title, 'Matches your list');
  const all = [...COLOUR_KEY.map((r) => `${r.title} ${r.meaning}`), ...GUIDE.flatMap((c) => [c.title, ...c.lines])].join(' ');
  assert.doesNotMatch(all, /\bcorrect\b/i);
  for (const l of LANG_ORDER) for (const k of ['go', 'check', 'stop'] as const) assert.doesNotMatch(spokenColour(l, k).text, /\bcorrect\b/i);
});

test('the colour key uses the words on the real result cards', () => {
  const scan = read('../app/(tabs)/scan.tsx');
  assert.match(scan, /Matches your list/);
  assert.match(scan, /Not a match/);
  assert.match(scan, /⚠ Check/);
});

test('spoken colours: English, Hindi and Bengali in their own words; other languages fall back to English', () => {
  assert.ok(hasSpokenColours('en') && hasSpokenColours('hi') && hasSpokenColours('bn'));
  assert.equal(spokenColour('hi', 'go').lang, 'hi');
  assert.notEqual(spokenColour('bn', 'stop').text, spokenColour('en', 'stop').text);
  for (const l of LANG_ORDER) {
    const s = spokenColour(l, 'check');
    assert.ok(s.text.length > 0);
    assert.ok(s.lang === l || s.lang === 'en');
    if (!hasSpokenColours(l)) assert.deepEqual(s, spokenColour('en', 'check'));
    assert.ok(LANGS[s.lang]);
  }
});

test('guide cards: short, unique, and links go to pages that exist', () => {
  const ids = new Set(GUIDE.map((c) => c.id));
  assert.equal(ids.size, GUIDE.length);
  assert.ok(GUIDE.some((c) => c.colours), 'one card shows the colours');
  assert.ok(GUIDE.some((c) => c.reminder), 'one card shows the reminder');
  for (const c of GUIDE) {
    assert.ok(c.lines.length >= 1 && c.lines.length <= 5, `${c.id}: at most about five things to read`);
    for (const l of c.lines) assert.ok(l.length <= 110, `${c.id}: one short sentence each`);
    if (c.link) {
      const path = c.link.to.split('?')[0].replace(/^\//, '');
      const file = ['test-scan'].includes(path) ? `../app/${path}.tsx` : `../app/(tabs)/${path}.tsx`;
      assert.doesNotThrow(() => read(file), `${c.link.to} exists`);
    }
  }
});

test('example reminder uses the real reminder wording', () => {
  const n = read('../src/notifications.ts');
  assert.match(n, /Medicine time · /);
  assert.match(EXAMPLE_REMINDER.title, /^💊 Medicine time · /);
  for (const a of EXAMPLE_REMINDER.actions) assert.match(n, new RegExp(`buttonTitle: '${a}'`));
});
