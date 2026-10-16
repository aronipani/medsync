// Unique ids for file names (photos, zips) so photos from many phones never clash when merged. Not for security.

/** A random RFC 4122 version-4 UUID, e.g. "3b241101-e2bb-4255-8caf-4136c566a962". */
export function uuid(rand: () => number = Math.random): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (rand === Math.random && typeof c?.randomUUID === 'function') return c.randomUUID();
  const b = Array.from({ length: 16 }, () => Math.floor(rand() * 256));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant
  const h = b.map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** "2026-10-16T02-04-05-123Z-1-3b241101-e2bb-4255-8caf-4136c566a962.jpg": time first (sorts), then a UUID. */
export function photoFileName(at: string, n: number, id = uuid()): string {
  return `${at.replace(/[:.]/g, '-')}-${n}-${id}.jpg`;
}
