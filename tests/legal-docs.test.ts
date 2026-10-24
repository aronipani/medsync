// The privacy policy and terms are shown in the app from bundled text; it must match PRIVACY.md and TERMS.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRIVACY_TEXT, TERMS_TEXT } from '../src/legalDocs.ts';
import { parseLegal } from '../src/legalParse.ts';
import { PRIVACY_URL, TERMS_URL } from '../src/legal.ts';

test('the app shows the current privacy policy and terms (run `npm run legal-docs` after editing them)', () => {
  assert.equal(PRIVACY_TEXT, readFileSync('PRIVACY.md', 'utf8'));
  assert.equal(TERMS_TEXT, readFileSync('TERMS.md', 'utf8'));
});

test('no link points at the private code repo', () => {
  for (const [name, text] of [['PRIVACY.md', PRIVACY_TEXT], ['TERMS.md', TERMS_TEXT], ['urls', `${PRIVACY_URL} ${TERMS_URL}`]]) {
    assert.doesNotMatch(text, /github\.com\/aronipani\/medsync/, name);
  }
});

test('both documents parse into a title, headings and readable text', () => {
  for (const md of [PRIVACY_TEXT, TERMS_TEXT]) {
    const blocks = parseLegal(md);
    assert.equal(blocks[0].kind, 'title');
    assert.ok(blocks.filter((b) => b.kind === 'heading').length >= 5);
    for (const b of blocks) for (const sp of b.spans) assert.doesNotMatch(sp.text, /\*\*|\]\(/);
  }
  const b = parseLegal('# T\n\n* **Bold** start\n  continued line\n* next');
  assert.deepEqual(b[1], { kind: 'bullet', indent: 0, spans: [{ text: 'Bold', bold: true }, { text: ' start continued line' }] });
});
