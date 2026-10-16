// Tiny HTTP layer shared by the Lambda handler and the local dev server. No framework.

export interface Req {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>; // lower-case names
  body: Buffer;
}

export interface Res {
  status: number;
  headers?: Record<string, string>;
  body?: unknown; // JSON-encoded unless it's a Buffer
}

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message = code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const ok = (body: unknown, status = 200): Res => ({ status, body });

export function json<T = unknown>(req: Req, maxBytes: number): T {
  if (req.body.length > maxBytes) throw new HttpError(413, 'too_large');
  try {
    return JSON.parse(req.body.toString('utf8')) as T;
  } catch {
    throw new HttpError(400, 'bad_json');
  }
}

export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Base64url ids and tokens: 22–64 chars (16–48 random bytes). Anything else is refused before touching storage. */
export function idParam(v: string | undefined, name: string): string {
  if (!v || !/^[A-Za-z0-9_-]{22,64}$/.test(v)) throw new HttpError(400, `bad_${name}`);
  return v;
}

export function header(req: Req, name: string, required = true): string {
  const v = req.headers[name];
  if (!v && required) throw new HttpError(401, `missing_${name}`);
  return v ?? '';
}
