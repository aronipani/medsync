// Dose-time scanning ("is this the right strip now?") is off by default in the US, where reminders and tracking fit
// FDA's "keeps track of medications and gives user-configured reminders" category and the scan check goes beyond it.
// A person can turn it back on after reading the disclosure. Scan to add (entering a medicine) is not affected.
// See docs/specs/19-us-launch.md.
import type { Settings } from './types.ts';

export const DOSE_SCAN_DISCLOSURE_VERSION = 1;

// Main US time zones (a US-region phone is caught by its locale; this catches e.g. an en-IN phone living in the US).
const US_ZONES = /^(America\/(New_York|Detroit|Chicago|Denver|Phoenix|Boise|Los_Angeles|Anchorage|Juneau|Indiana\/.+|Kentucky\/.+|North_Dakota\/.+|Menominee|Adak|Nome|Sitka|Yakutat|Metlakatla)|Pacific\/Honolulu|US\/.+)$/;

export interface Place {
  region?: string; // "US", "IN" from the phone's locale
  timeZone?: string; // "America/Los_Angeles"
}

export function phonePlace(): Place {
  try {
    const o = Intl.DateTimeFormat().resolvedOptions();
    const region = /[-_]([A-Z]{2})\b/.exec(o.locale ?? '')?.[1];
    return { region, timeZone: o.timeZone };
  } catch {
    return {};
  }
}

export function inUnitedStates(p: Place = phonePlace()): boolean {
  return p.region === 'US' || (!!p.timeZone && US_ZONES.test(p.timeZone));
}

/**
 * Is the dose-time scan check on? A person's own choice wins; otherwise on everywhere except where the app was set up
 * in the US. "Set up" (not "is now") so a parent from India visiting family in the US keeps scanning.
 * This is a default, not a lock: anyone can turn scanning on after the disclosure.
 */
export function setUpInUS(settings: Settings): boolean {
  return settings.setupInUS ?? inUnitedStates();
}

export function doseScanOn(settings: Settings, us: boolean = setUpInUS(settings)): boolean {
  const c = settings.doseScan;
  if (c && !c.on) return false;
  if (c?.on) return !us || (c.disclosure ?? 0) >= DOSE_SCAN_DISCLOSURE_VERSION;
  return !us;
}

export const DOSE_SCAN_DISCLOSURE = [
  'TakeSure is a reminder and record-keeping aid. It is not a medical device and has not been reviewed or cleared by the U.S. Food and Drug Administration (FDA).',
  'The scan only checks whether a strip, box or bottle seems to match a medicine on your own list for this time. It does not identify medicines, and it can be wrong: glare, worn print, look-alike names or a list entered incorrectly can all give a wrong result.',
  'It never decides what or how much to take. The amounts shown are the ones you entered from the prescription.',
  'If you are unsure about any medicine, do not rely on the app — ask your pharmacist or doctor. In an emergency, call 911.',
  'Medicines filled in from a US label or the FDA medicine list are drafts for you to check, and the list may be out of date.',
  'Everything stays on this phone. Nothing is sent to anyone.',
];
