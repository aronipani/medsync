// Which build is installed. Set by the GitHub build (see .github/workflows); empty in local development builds.
import Constants from 'expo-constants';

const build = process.env.EXPO_PUBLIC_BUILD || ''; // "build-24" (Android) or "ios-20" (iPhone) — the release tag
const commit = (process.env.EXPO_PUBLIC_COMMIT || '').slice(0, 7);
const builtAt = process.env.EXPO_PUBLIC_BUILT_AT || '';

export const appVersion = Constants.expoConfig?.version ?? '';

/** "1.0.0 · build-24 · 5b9a915 · 15 Oct 2026", or "1.0.0 · development build". */
export function buildLabel(): string {
  const date = builtAt ? new Date(builtAt) : undefined;
  const when = date && !isNaN(date.getTime()) ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const parts = [appVersion, build || 'development build', commit, when].filter(Boolean);
  return parts.join(' · ');
}
