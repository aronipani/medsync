// Saving and opening backup files on the phone (share sheet, document picker) and the one-step safety copy.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { backupFileName, makeBackup, parseBackup, type ParseResult } from './backup.ts';
import type { AppState, Settings } from './types.ts';

const SAFETY_KEY = 'medsync:before-restore';

/** Opens the share sheet with a backup file. Resolves true when the sheet was shown. */
export async function shareBackup(state: AppState): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this phone.');
  const out = new File(Paths.cache, backupFileName());
  if (out.exists) out.delete();
  out.create();
  out.write(JSON.stringify(makeBackup(state), null, 1));
  await Sharing.shareAsync(out.uri, { mimeType: 'application/json', dialogTitle: 'Save DoseSure backup', UTI: 'public.json' });
  return true;
}

/** Lets the person pick a backup file and checks it. Undefined when they cancelled. */
export async function pickBackup(defaults: Settings): Promise<ParseResult | undefined> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.length) return undefined;
  const text = await new File(res.assets[0].uri).text();
  return parseBackup(text, defaults);
}

export async function saveSafetyCopy(state: AppState): Promise<void> {
  await AsyncStorage.setItem(SAFETY_KEY, JSON.stringify({ at: new Date().toISOString(), state }));
}

export async function loadSafetyCopy(): Promise<{ at: string; state: AppState } | undefined> {
  const raw = await AsyncStorage.getItem(SAFETY_KEY).catch(() => null);
  return raw ? JSON.parse(raw) : undefined;
}

export async function clearSafetyCopy(): Promise<void> {
  await AsyncStorage.removeItem(SAFETY_KEY).catch(() => {});
}
