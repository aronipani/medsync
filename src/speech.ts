import * as Speech from 'expo-speech';
import { LANGS, type LangCode } from './phrases.ts';

let voices: Speech.Voice[] | null = null;

async function loadVoices(): Promise<Speech.Voice[]> {
  if (voices && voices.length) return voices;
  try {
    voices = await Speech.getAvailableVoicesAsync();
  } catch {
    voices = [];
  }
  return voices;
}

const same = (a: string, b: string) => a.toLowerCase().replace('_', '-') === b.toLowerCase().replace('_', '-');
const sameLang = (a: string, b: string) => a.toLowerCase().split(/[-_]/)[0] === b.toLowerCase().split(/[-_]/)[0];

/** The voice language this phone can use for a family member's language, if any. */
export async function voiceFor(lang: LangCode): Promise<string | undefined> {
  const list = await loadVoices();
  for (const code of LANGS[lang].tts) {
    if (list.some((v) => same(v.language, code))) return code;
  }
  for (const code of LANGS[lang].tts) {
    const v = list.find((x) => sameLang(x.language, code));
    if (v) return v.language;
  }
  // Some Android phones don't list voices but still speak the language.
  return list.length ? undefined : LANGS[lang].tts[0];
}

export async function hasVoice(lang: LangCode): Promise<boolean> {
  const list = await loadVoices();
  if (!list.length) return true; // can't tell — assume yes
  return LANGS[lang].tts.some((code) => list.some((v) => sameLang(v.language, code)));
}

/** Speaks text in the member's language (falls back to English if the phone has no such voice). */
export async function say(lang: LangCode, text: string) {
  try {
    await Speech.stop();
    const language = (await voiceFor(lang)) ?? (await voiceFor('en')) ?? 'en-IN';
    Speech.speak(text, { language, rate: 0.9, pitch: 1.0 });
  } catch {
    // Speaking is a convenience; never block the screen on it.
  }
}

export function stopSpeaking() {
  Speech.stop().catch(() => {});
}
