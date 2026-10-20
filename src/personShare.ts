// Sending one person's medicines to another phone, and opening such a file (spec 20).
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { makePersonFile, parsePersonFile, personFileName, type PersonParse } from './personFile.ts';
import { deviceZone } from './time.ts';
import type { AppState } from './types.ts';

/** Opens the share sheet (WhatsApp, email, Drive…) with this person's file. */
export async function sharePerson(state: AppState, memberId: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this phone.');
  const f = makePersonFile(state, memberId, deviceZone());
  const out = new File(Paths.cache, personFileName(f));
  if (out.exists) out.delete();
  out.create();
  out.write(JSON.stringify(f));
  await Sharing.shareAsync(out.uri, { mimeType: 'application/json', dialogTitle: `Send ${f.member.name}'s medicines`, UTI: 'public.json' });
}

/** Lets the person pick a file someone sent. Undefined when they cancelled. */
export async function pickPersonFile(): Promise<PersonParse | undefined> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.length) return undefined;
  return parsePersonFile(await new File(res.assets[0].uri).text());
}
