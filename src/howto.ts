// "How to use TakeSure" (spec 22): the colour key and the short guide cards in Settings → Help.
// Pure (no React Native) so it can be tested. The words match the real screens: the green card says
// "Matches your list" (never "correct"), amber "Check", red "Not a match".
import type { LangCode } from './phrases.ts';

export type ColourKind = 'go' | 'check' | 'stop';

export interface ColourRow {
  kind: ColourKind;
  symbol: string; // meaning is never colour alone
  title: string; // the words on the real result card
  meaning: string; // what to do, one line
}

export const COLOUR_KEY: ColourRow[] = [
  { kind: 'go', symbol: '✓', title: 'Matches your list', meaning: 'Take the amount shown on the screen.' },
  { kind: 'check', symbol: '⚠', title: 'Check', meaning: 'Read the name on the strip yourself, or scan the other side.' },
  { kind: 'stop', symbol: '✋', title: 'Not a match', meaning: "Don't take it. Put it aside and scan the next strip." },
];

/** The same three meanings spoken aloud. English always; other languages where checked translations exist. */
const SPOKEN: Partial<Record<LangCode, Record<ColourKind, string>>> = {
  en: {
    go: 'Green means it matches your list. Take the amount shown on the screen.',
    check: 'Amber means check. Read the name on the strip yourself, or scan the other side.',
    stop: "Red means not a match. Don't take it. Put it aside and scan the next strip.",
  },
  hi: {
    go: 'हरा मतलब यह आपकी सूची की दवा है। स्क्रीन पर लिखी मात्रा लीजिए।',
    check: 'पीला मतलब जाँचिए। पत्ते पर दवा का नाम खुद पढ़िए, या दूसरी तरफ़ से स्कैन कीजिए।',
    stop: 'लाल मतलब यह वह दवा नहीं है। इसे मत लीजिए। अलग रखिए और अगला पत्ता स्कैन कीजिए।',
  },
  bn: {
    go: 'সবুজ মানে এটি আপনার তালিকার ওষুধ। স্ক্রিনে যতটা লেখা আছে ততটা নিন।',
    check: 'হলুদ মানে মিলিয়ে দেখুন। স্ট্রিপে ওষুধের নাম নিজে পড়ুন, অথবা অন্য দিক থেকে স্ক্যান করুন।',
    stop: 'লাল মানে এটি সেই ওষুধ নয়। এটি খাবেন না। সরিয়ে রাখুন আর পরের স্ট্রিপ স্ক্যান করুন।',
  },
};

/**
 * What to say for one colour, and in which voice language. Languages without a checked translation are spoken
 * in English with an English voice (an English sentence read by a Tamil voice helps no one).
 */
export function spokenColour(lang: LangCode, kind: ColourKind): { lang: LangCode; text: string } {
  const own = SPOKEN[lang]?.[kind];
  return own ? { lang, text: own } : { lang: 'en', text: SPOKEN.en![kind] };
}

/** Whether the colour key can be spoken in this language (otherwise English is used). */
export const hasSpokenColours = (lang: LangCode) => !!SPOKEN[lang];

export interface GuideLink {
  title: string;
  to: string; // route
}

export interface GuideCard {
  id: string;
  title: string;
  lines: string[]; // short sentences, one idea each
  colours?: boolean; // show the colour key
  reminder?: boolean; // show the example reminder
  link?: GuideLink;
}

export const GUIDE: GuideCard[] = [
  {
    id: 'time',
    title: 'At medicine time',
    reminder: true,
    lines: [
      'A reminder comes at each medicine time, with every medicine due then.',
      'Tap Scan now and hold each strip up to the camera.',
      'Today ticks each one off. Remind me later asks again in a few minutes.',
    ],
  },
  {
    id: 'colours',
    title: 'Green, amber, red',
    colours: true,
    lines: ['Every scan ends in one of three colours, always with a symbol and words.'],
  },
  {
    id: 'scan',
    title: "When a scan doesn't work",
    lines: [
      'Turn the strip over and scan the other side.',
      'Move to more light, or switch on the torch. Tilt shiny strips away from the light.',
      'Still not read? Tap “Can’t scan? Type the name instead”.',
      'Check the strips before the next medicine time, so there are no surprises.',
    ],
    link: { title: 'Check the strips', to: '/test-scan' },
  },
  {
    id: 'supplies',
    title: 'Running low and buying',
    lines: [
      'The count goes down with each dose taken.',
      'When a medicine runs low, Today shows one line. Tap it to see what to buy.',
      'After buying, Medicines → Supplies → Refill adds the new strips.',
      'A new medicine has no count until you enter one.',
      'Supplies keeps a list to buy and your pharmacies.',
    ],
    link: { title: 'Open Supplies', to: '/meds?view=supplies' },
  },
  {
    id: 'backup',
    title: 'Keeping a backup',
    lines: [
      'A backup saves everyone, their medicines and the history in one small file.',
      'Keep it in Drive, WhatsApp or email. If the phone is lost, open it on the new phone.',
      'TakeSure reminds you if there is no backup for 30 days.',
    ],
    link: { title: 'Save a backup', to: '/data' },
  },
];

/** An example reminder with the real wording, for the guide (not a real notification). */
export const EXAMPLE_REMINDER = {
  title: '💊 Medicine time · 8:30 AM',
  body: 'Clopilet 75 — 1 tablet after breakfast',
  actions: ['Scan now', 'Remind me later'],
};
