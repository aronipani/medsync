// What would be sent when a person shares a photo of an unrecognised strip. Pure — see
// docs/specs/07-photo-sharing-consent.md. The feature stays hidden until an upload endpoint exists.

/** Upload endpoint for shared strip photos. Empty = sharing is not available in this build. */
export const SHARE_ENDPOINT = '';

export const sharingAvailable = (endpoint: string = SHARE_ENDPOINT) => /^https:\/\//.test(endpoint);

export interface ShareRecord {
  month: string; // YYYY-MM the photo was taken
  appVersion: string;
  platform: 'android' | 'ios';
  medicine?: string; // only what the person typed or picked
}

/**
 * The details sent with a shared photo. Accepts whatever the caller has, but keeps only the fields in the spec —
 * text read from the photo, family member, exact times and ids are dropped on purpose.
 */
export function shareRecord(input: { takenAt: Date; appVersion: string; platform: string; typedName?: string } & Record<string, unknown>): ShareRecord {
  const name = (input.typedName ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const d = input.takenAt;
  return {
    month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    appVersion: String(input.appVersion).slice(0, 20),
    platform: input.platform === 'ios' ? 'ios' : 'android',
    ...(name ? { medicine: name } : {}),
  };
}
