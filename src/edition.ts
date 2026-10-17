// Which kind of build this is (spec 08).
// Store builds (App Store / Play Store, built by EAS with EXPO_PUBLIC_STORE_BUILD=1) leave out the developer tools for
// improving the scanner: keeping training photos, Collect strip photos and Send photos. Those send health photos to
// the developer, which the store privacy labels ("Data Not Collected") and the public privacy policy don't cover.
// Sideloaded builds (GitHub Actions APK / AltStore IPA) for family and friends who help train the scanner keep them.

export const STORE_BUILD = process.env.EXPO_PUBLIC_STORE_BUILD === '1';

/** Training photos can be kept and sent from this build. */
export const TRAINING_AVAILABLE = !STORE_BUILD;

/** Whether scans should keep training photos: only when the build allows it and the helper turned it on. */
export function keepsTraining(settings: { collectTraining?: boolean }): boolean {
  return TRAINING_AVAILABLE && !!settings.collectTraining;
}
