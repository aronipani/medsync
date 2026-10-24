// Anonymous install tokens. No account, no phone id: the phone gets a random token on first run and can
// throw it away any time ("Reset" in Settings). The token is only used for rate limits, never stored in
// the clear and never linked to anything the phone sends.
//
// Format: <16 random bytes, base64url>.<HMAC-SHA256(secret, random) first 16 bytes, base64url>
// Self-checking, so the server keeps no list of issued tokens.

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpError, type Req } from './http.ts';

const b64u = (b: Buffer) => b.toString('base64url');

export function issueInstallToken(secret: string): string {
  const r = randomBytes(16);
  return `${b64u(r)}.${b64u(createHmac('sha256', secret).update(r).digest().subarray(0, 16))}`;
}

export function verifyInstallToken(token: string, secret: string): boolean {
  const m = /^([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{22})$/.exec(token);
  if (!m) return false;
  const want = createHmac('sha256', secret).update(Buffer.from(m[1], 'base64url')).digest().subarray(0, 16);
  const got = Buffer.from(m[2], 'base64url');
  return got.length === want.length && timingSafeEqual(got, want);
}

/**
 * Checks `Authorization: Install <token>` and returns a key for rate limits only. The key changes every UTC day, so
 * stored counters can't tie one install's activity together across days (limits are per day anyway).
 */
export function installFrom(req: Req, secret: string, now: number = Date.now()): string {
  const m = /^Install\s+(\S+)$/.exec(req.headers['authorization'] ?? '');
  if (!m || !verifyInstallToken(m[1], secret)) throw new HttpError(401, 'bad_install_token');
  const day = Math.floor(now / 86_400_000);
  return createHmac('sha256', secret).update(`rate:${day}:${m[1]}`).digest('base64url').slice(0, 32);
}

export const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('base64url');

/** Compares a presented secret with the stored hash of it. */
export function matchesHash(presented: string, storedHash: unknown): boolean {
  if (typeof storedHash !== 'string') return false;
  const a = Buffer.from(sha256(presented));
  const b = Buffer.from(storedHash);
  return a.length === b.length && timingSafeEqual(a, b);
}
