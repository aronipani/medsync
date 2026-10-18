// Last resort for a strip the phone can't read (spec 15/16): after repeated weak reads, ask the TakeSure server's
// model which of THIS household's medicines the photos show. STUB for now — it always answers "unavailable", so
// scanning behaves exactly as before. The real version will post the photos to /v1/strip/read (see server/),
// only with the household's opt-in, and its answer can lift a scan to amber at most, never to green.
import type { Medication } from './types.ts';

/** Weak reads in a row on the Scan tab before the server is asked. */
export const SERVER_FALLBACK_AFTER = 2;

export type ServerFallback =
  | { kind: 'unavailable'; why: 'not-built' | 'no-server' | 'not-allowed' | 'offline' }
  | { kind: 'read'; medId: string | null; confidence: number }; // medId null = none of the household's medicines

/** Whether the scan has failed often enough in a row to ask the server. */
export const shouldAskServer = (weakInARow: number): boolean => weakInARow >= SERVER_FALLBACK_AFTER;

export async function readOnServer(_photos: string[], _household: Pick<Medication, 'id' | 'name' | 'strength'>[]): Promise<ServerFallback> {
  return { kind: 'unavailable', why: 'not-built' };
}
