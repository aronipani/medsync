// Safety notice and privacy text, shared by the first-run notice and the About & safety page.
// See docs/specs/03-safety-and-privacy.md. Keep PRIVACY.md in step with dataPoints().

import { TRAINING_AVAILABLE } from './edition.ts';
import type { Settings } from './types.ts';

/** Raise when the notice changes in a way people must see again. */
export const NOTICE_VERSION = 2; // 2: not a medical device, doses come from the prescription, prescription drafts

export const PRIVACY_URL = 'https://github.com/aronipani/medsync/blob/main/PRIVACY.md';
export const ISSUES_URL = 'https://github.com/aronipani/medsync/issues';

export const SAFETY_HEADLINE = 'TakeSure helps you remember and check — it does not replace your doctor or pharmacist.';

export const SAFETY_POINTS = [
  'TakeSure is a reminder and record-keeping aid. It is not a medical device and does not diagnose, treat or give medical advice.',
  'It does not work out doses. The amount shown is what you or your family entered from the prescription.',
  'The scanner can be wrong. Always read the name and strength on the strip yourself before taking it.',
  'A prescription read from a photo is only a draft. Check every medicine and amount against the prescription before saving.',
  'Follow your prescription. Never change, stop or double a medicine because of the app — ask your doctor.',
  '"Same medicine" warnings only cover medicines in the app\'s list. No warning does not mean it is safe.',
  'In an emergency, call your doctor or emergency services (112 in India).',
];

export const PRIVACY_HEADLINE = 'Your data stays on this phone. No account, no ads, no tracking.';

const READER_ANDROID = 'Text is read from photos on the phone (Google ML Kit). ML Kit may send Google anonymous usage statistics, never your photos.';
const READER_IOS =
  "Text is read from photos on the phone by Apple's built-in reader (Apple Vision); nothing is sent. If it can't read a photo, Google ML Kit is used instead, which may send Google anonymous usage statistics, never your photos.";

/** The privacy points for this phone: the text reader differs between iPhone and Android. */
export function dataPoints(os: string): string[] {
  return [
    'Medicines, schedules, dose history and photos are stored only on this phone.',
    os === 'ios' ? READER_IOS : READER_ANDROID,
    "Spoken announcements use your phone's own voices. Reminders are set on the phone — there is no server.",
    TRAINING_AVAILABLE
      ? 'Data leaves the phone only when you choose: a backup file you share, or training photos you export or email yourself.'
      : 'Data leaves the phone only when you choose: a backup file you share, or a problem report you email.',
  ];
}

export const needsNotice = (s: Pick<Settings, 'acceptedNotice'>) => (s.acceptedNotice ?? 0) < NOTICE_VERSION;
