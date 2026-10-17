// Local dev server: everything in memory, a fake model unless ANTHROPIC_API_KEY is set.
//   npm run local          → http://localhost:8787
//   ANTHROPIC_API_KEY=… MODEL=claude-sonnet-5-5 npm run local   → reads real strips
import { createServer } from 'node:http';
import { handle } from './api.ts';
import { AnthropicReader } from './model/anthropic.ts';
import { MemoryBlobs, MemoryKV } from './store/memory.ts';

const key = process.env.ANTHROPIC_API_KEY;
const deps = {
  kv: new MemoryKV(),
  blobs: new MemoryBlobs(),
  reader: key
    ? new AnthropicReader(async () => key, process.env.MODEL ?? 'claude-sonnet-5-5')
    : { read: async () => ({ brand: 'Clopilet', strength: '75 mg', generic: 'Clopidogrel', tokens: ['CLOPILET', '75'], confidence: {} }) },
  installSecret: 'local-dev-secret',
  modelCallsPerDay: 1000,
};

createServer(async (r, w) => {
  const chunks: Buffer[] = [];
  for await (const c of r) chunks.push(c as Buffer);
  const url = new URL(r.url ?? '/', 'http://localhost');
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(r.headers)) if (typeof v === 'string') headers[k] = v;
  const res = await handle({ method: r.method ?? 'GET', path: url.pathname, query: Object.fromEntries(url.searchParams), headers, body: Buffer.concat(chunks) }, deps);
  const binary = Buffer.isBuffer(res.body);
  w.writeHead(res.status, { 'content-type': binary ? 'application/octet-stream' : 'application/json', ...res.headers });
  w.end(res.body === undefined ? '' : binary ? res.body : JSON.stringify(res.body));
}).listen(8787, () => console.log('TakeSure server on http://localhost:8787'));
