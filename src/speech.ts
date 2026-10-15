import { setAudioModeAsync } from 'expo-audio';
import * as Speech from 'expo-speech';
import { LANGS, type LangCode } from './phrases.ts';

let voices: Speech.Voice[] | null = null;
let audioReady = false;

/** iPhone mutes app speech when the silent switch is on; medicine messages should still be heard. */
async function prepareAudio() {
  if (audioReady) return;
  try {
    await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers', shouldPlayInBackground: false });
    audioReady = true;
  } catch {
    // Older devices: speech still works when not in silent mode.
  }
}

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

export type SpeakStatus = 'speaking' | 'done' | 'noVoice' | 'fallback' | 'error';

/**
 * Speaks text in the member's language. If the phone has no voice for that language it uses English:
 * the same text when it is in Latin script, else `english` (the same message in English) with status 'fallback'.
 * Only when neither works does it report 'noVoice' (see docs/specs/06-voice-fallback.md).
 */
export async function say(lang: LangCode, text: string, onStatus?: (s: SpeakStatus, detail?: string) => void, english?: string) {
  try {
    await prepareAudio();
    await Speech.stop();
    let language = await voiceFor(lang);
    let fellBack = false;
    if (!language) {
      const latin = /^[\p{Script=Latin}\p{N}\p{P}\p{Zs}]*$/u.test(text);
      language = (await voiceFor('en')) ?? 'en-IN';
      if (english && lang !== 'en') {
        text = english; // the same message in English (an English voice reading Spanish or Bengali helps no one)
        fellBack = true;
      } else if (!latin) {
        onStatus?.('noVoice');
        return;
      }
    }
    onStatus?.(fellBack ? 'fallback' : 'speaking');
    Speech.speak(text, {
      language,
      rate: 0.9,
      pitch: 1.0,
      useApplicationAudioSession: true,
      onDone: () => onStatus?.(fellBack ? 'fallback' : 'done'),
      onStopped: () => onStatus?.(fellBack ? 'fallback' : 'done'),
      onError: (e) => onStatus?.('error', String(e?.message ?? e)),
    });
  } catch (e) {
    onStatus?.('error', String(e));
  }
}

export function stopSpeaking() {
  Speech.stop().catch(() => {});
}
