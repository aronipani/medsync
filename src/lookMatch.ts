// "Look" evidence (spec 15): how much a scan photo looks like each household medicine's saved strip photos.
// Pure — no React Native — so it can be unit tested. The phone side is src/look.ts.
//
// Look is weak evidence: the photo includes a hand and the table, two brands can share a foil colour, and a
// pharmacy may hand over a new pack design. So look can only lift a weak read to amber ("check the name") — it
// never gives a green and never says "wrong medicine" on its own.

/** Distance of a scan photo to one medicine's closest saved photo (smaller = more alike). */
export interface LookScore {
  medId: string;
  distance: number;
}

export type LookVerdict = { kind: 'look'; medId: string; distance: number; next?: number } | { kind: 'none'; why: 'no-photos' | 'too-far' | 'too-close-call' };

// Vision feature print revision 2 (iOS 17+) gives unit-length prints, so distances run about 0 (same) to 2.
// Calibrated loosely: the same strip in another photo lands well under LOOK_MAX; different strips usually over it.
// Scan traces record every distance, so these can be tuned from real scans.
export const LOOK_MAX = { 1: 18, 2: 0.6 } as const; // revision 1 prints are not normalised: a different scale
export const LOOK_MARGIN = 1.3; // the closest medicine must be this many times closer than the next one

/** Closest saved photo per medicine, from one distance per reference photo (-1 = unreadable, ignored). */
export function bestPerMed(refs: { medId: string }[], distances: number[]): LookScore[] {
  const best = new Map<string, number>();
  refs.forEach((r, i) => {
    const d = distances.at(i);
    if (d === undefined || d < 0 || !Number.isFinite(d)) return;
    const was = best.get(r.medId);
    if (was === undefined || d < was) best.set(r.medId, d);
  });
  return [...best.entries()].map(([medId, distance]) => ({ medId, distance })).sort((a, b) => a.distance - b.distance);
}

/** Which household medicine the photo looks like, if one stands out clearly enough. */
export function decideLook(scores: LookScore[], revision: number): LookVerdict {
  if (!scores.length) return { kind: 'none', why: 'no-photos' };
  const max = revision >= 2 ? LOOK_MAX[2] : LOOK_MAX[1];
  const [top, second] = [...scores].sort((a, b) => a.distance - b.distance);
  if (top.distance > max) return { kind: 'none', why: 'too-far' };
  if (second && second.distance < top.distance * LOOK_MARGIN) return { kind: 'none', why: 'too-close-call' };
  return { kind: 'look', medId: top.medId, distance: top.distance, next: second?.distance };
}
