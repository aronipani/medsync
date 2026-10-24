// Turns PRIVACY.md / TERMS.md (the small markdown subset they use) into blocks the app can show offline.
// Supported: "# " title, "## " heading, "_…_" note line, "* " bullets with indented continuation lines, paragraphs,
// **bold**, [text](link) → text, `code` → text.

export interface Span {
  text: string;
  bold?: boolean;
}
export interface Block {
  kind: 'title' | 'heading' | 'note' | 'para' | 'bullet';
  spans: Span[];
  indent?: number; // bullets: 0 or 1
}

function spans(text: string): Span[] {
  const clean = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/`([^`]+)`/g, '$1');
  const out: Span[] = [];
  const parts = clean.split(/\*\*/);
  parts.forEach((p, i) => p && out.push(i % 2 ? { text: p, bold: true } : { text: p }));
  return out;
}

export function parseLegal(md: string): Block[] {
  const blocks: Block[] = [];
  let cur: { kind: Block['kind']; text: string; indent?: number } | undefined;
  const flush = () => {
    if (cur) blocks.push({ kind: cur.kind, spans: spans(cur.text.trim()), ...(cur.indent !== undefined ? { indent: cur.indent } : {}) });
    cur = undefined;
  };
  for (const line of md.split('\n')) {
    const t = line.trim();
    if (!t) {
      flush();
      continue;
    }
    const bullet = /^(\s*)[*-]\s+(.*)$/.exec(line);
    if (t.startsWith('## ')) {
      flush();
      blocks.push({ kind: 'heading', spans: spans(t.slice(3)) });
    } else if (t.startsWith('# ')) {
      flush();
      blocks.push({ kind: 'title', spans: spans(t.slice(2)) });
    } else if (/^_.*_$/.test(t)) {
      flush();
      blocks.push({ kind: 'note', spans: spans(t.slice(1, -1)) });
    } else if (bullet) {
      flush();
      cur = { kind: 'bullet', text: bullet[2], indent: bullet[1].length >= 2 ? 1 : 0 };
    } else if (cur) {
      cur.text += ` ${t}`;
    } else {
      cur = { kind: 'para', text: t };
    }
  }
  flush();
  return blocks;
}
