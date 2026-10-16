// AWS Lambda entry (API Gateway HTTP API, payload format 2.0).
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { handle, type Deps } from './api.ts';
import type { Req } from './http.ts';
import { AnthropicReader } from './model/anthropic.ts';
import { DynamoKV, S3Blobs } from './store/aws.ts';

interface HttpEvent {
  rawPath: string;
  rawQueryString?: string;
  headers?: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
  requestContext: { http: { method: string } };
}

const ssm = new SSMClient({});
const cache = new Map<string, Promise<string>>();
/** Secrets live in SSM Parameter Store (SecureString), read once per Lambda instance. */
const secret = (name: string) => {
  if (!cache.has(name)) {
    const p = ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true })).then((r) => r.Parameter?.Value ?? '');
    p.catch(() => cache.delete(name));
    cache.set(name, p);
  }
  return cache.get(name)!;
};

const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`missing env ${k}`);
  return v;
};

let deps: Promise<Deps> | undefined;
const makeDeps = async (): Promise<Deps> => ({
  kv: new DynamoKV(env('TABLE')),
  blobs: new S3Blobs(env('BUCKET')),
  reader: new AnthropicReader(() => secret(env('MODEL_KEY_PARAM')), env('MODEL')),
  installSecret: await secret(env('INSTALL_SECRET_PARAM')),
  modelCallsPerDay: Number(process.env.MODEL_CALLS_PER_DAY ?? 500),
});

export async function main(event: HttpEvent) {
  const t0 = Date.now();
  deps ??= makeDeps().catch((e) => {
    deps = undefined;
    throw e;
  });
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(event.headers ?? {})) if (v !== undefined) headers[k.toLowerCase()] = v;
  const req: Req = {
    method: event.requestContext.http.method,
    path: event.rawPath,
    query: Object.fromEntries(new URLSearchParams(event.rawQueryString ?? '')),
    headers,
    body: event.body ? Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8') : Buffer.alloc(0),
  };
  const res = await handle(req, await deps);
  // The only log line: route shape, status, time. No ids, tokens, bodies or addresses.
  console.log(JSON.stringify({ route: `${req.method} ${req.path.replace(/\/[A-Za-z0-9_-]{22,64}(?=\/|$)/g, '/:id')}`, status: res.status, ms: Date.now() - t0 }));
  const binary = Buffer.isBuffer(res.body);
  return {
    statusCode: res.status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...res.headers },
    isBase64Encoded: binary,
    body: res.body === undefined ? '' : binary ? (res.body as Buffer).toString('base64') : JSON.stringify(res.body),
  };
}
