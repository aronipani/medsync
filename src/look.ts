// Compares a scan photo with the household's saved strip photos (spec 15, "look"), on the phone.
// iPhone only for now: Apple Vision's image feature print. Android has no built-in equivalent yet, so look
// evidence is simply absent there and scanning works as before.
import { AppleText } from '../modules/apple-text/index.ts';
import { bestPerMed, decideLook, type LookScore, type LookVerdict } from './lookMatch.ts';
import { referenceUri } from './profileFiles.ts';
import type { Medication } from './types.ts';

export interface LookResult {
  verdict: LookVerdict;
  scores: LookScore[]; // closest distance per medicine, for the scan trace
  revision: number;
}

/** Whether this build can compare how strips look. */
export const lookAvailable = (): boolean => !!AppleText?.lookDistances;

/** How much the photo looks like each medicine's saved strip photos (fresh-strip anchors and confirmed scans). */
export async function lookAt(photo: string, meds: Medication[]): Promise<LookResult | null> {
  const native = AppleText;
  if (!native?.lookDistances) return null;
  const refs: { medId: string; uri: string }[] = [];
  for (const m of meds) {
    for (const name of [...(m.profile?.anchors ?? []), ...(m.profile?.refs ?? [])]) {
      const uri = referenceUri(name);
      if (uri) refs.push({ medId: m.id, uri });
    }
  }
  if (!refs.length) return { verdict: { kind: 'none', why: 'no-photos' }, scores: [], revision: 0 };
  try {
    const { distances, revision } = await native.lookDistances(photo, refs.map((r) => r.uri));
    const scores = bestPerMed(refs, distances);
    return { verdict: decideLook(scores, revision), scores, revision };
  } catch {
    return null;
  }
}

/** One line for helpers ("Look: Pantodac 0.31, Clopilet 0.72") so the thresholds can be tuned from real scans. */
export function lookLabel(look: LookResult | null, meds: Pick<Medication, 'id' | 'name'>[]): string | undefined {
  if (!look) return lookAvailable() ? 'look: failed' : undefined;
  if (!look.scores.length) return 'look: no saved strip photos';
  const name = (id: string) => meds.find((m) => m.id === id)?.name ?? '?';
  const list = look.scores.slice(0, 3).map((x) => `${name(x.medId)} ${x.distance.toFixed(2)}`).join(', ');
  const v = look.verdict.kind === 'look' ? `looks like ${name(look.verdict.medId)}` : look.verdict.why;
  return `look (v${look.revision}): ${v} — ${list}`;
}
