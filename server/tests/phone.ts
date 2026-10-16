// What the phone does before talking to the server (reference for the app; spec 16, "Keys").
// The app implements the same with @noble/hashes + @noble/ciphers (React Native has no WebCrypto AES).
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const derive = (key: Buffer, info: string, len: number) => Buffer.from(hkdfSync('sha256', key, 'dosesure', info, len));

/** kind: 'vault' (backup key) or 'circle' (family circle key). */
export function keysFrom(key: Buffer, kind: 'vault' | 'circle') {
  return {
    id: derive(key, `${kind}-id`, 24).toString('base64url'), // 32 chars
    token: derive(key, `${kind}-token`, 32).toString('base64url'), // 43 chars
    enc: derive(key, `${kind}-enc`, 32),
  };
}

/** 0x01 | 12-byte nonce | AES-256-GCM ciphertext | 16-byte tag */
export function seal(enc: Buffer, plain: Buffer): Buffer {
  const nonce = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', enc, nonce);
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([Buffer.from([1]), nonce, body, c.getAuthTag()]);
}

export function open(enc: Buffer, sealed: Buffer): Buffer {
  if (sealed[0] !== 1) throw new Error('unknown format');
  const d = createDecipheriv('aes-256-gcm', enc, sealed.subarray(1, 13));
  d.setAuthTag(sealed.subarray(sealed.length - 16));
  return Buffer.concat([d.update(sealed.subarray(13, sealed.length - 16)), d.final()]);
}
