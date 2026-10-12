// Optional collection of confirmed scan photos, labelled with the medicine, for training an image model later.
// Off by default. Photos stay on the phone until the person exports them.

import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Sharing from 'expo-sharing';
import { makeZip } from './zip.ts';

export interface TrainingEntry {
  file: string; // path inside the export, e.g. "Monotrate 10/2026-10-12T09-30-00-1.jpg"
  medicine: string; // "Monotrate 10"
  name: string;
  strength: string;
  contents?: string; // "Isosorbide Mononitrate 10 mg"
  how: 'dose-check' | 'taught' | 'scan-to-add';
  ocrText: string;
  at: string;
}

const dir = () => new Directory(Paths.document, 'training');
const manifestFile = () => new File(dir(), 'manifest.json');
const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'unknown';

function readManifest(): TrainingEntry[] {
  try {
    const f = manifestFile();
    return f.exists ? (JSON.parse(f.textSync()) as TrainingEntry[]) : [];
  } catch {
    return [];
  }
}

function writeManifest(entries: TrainingEntry[]) {
  const f = manifestFile();
  if (!f.exists) f.create();
  f.write(JSON.stringify(entries, null, 1));
}

/** Saves photos of a confirmed strip (resized to 1280 px wide JPEG). Returns how many were saved. */
export async function saveTrainingPhotos(
  uris: string[],
  label: { name: string; strength: string; contents?: string },
  how: TrainingEntry['how'],
  ocrText: string,
): Promise<number> {
  if (!uris.length) return 0;
  try {
    const root = dir();
    if (!root.exists) root.create({ intermediates: true });
    const medicine = `${label.name} ${label.strength}`.trim();
    const folder = new Directory(root, safe(medicine));
    if (!folder.exists) folder.create({ intermediates: true });
    const entries = readManifest();
    const at = new Date().toISOString();
    let saved = 0;
    for (let i = 0; i < uris.length; i++) {
      const ref = await ImageManipulator.manipulate(uris[i]).resize({ width: 1280 }).renderAsync();
      const img = await ref.saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
      const fileName = `${at.replace(/[:.]/g, '-')}-${i + 1}.jpg`;
      await new File(img.uri).copy(new File(folder, fileName));
      entries.push({ file: `${safe(medicine)}/${fileName}`, medicine, name: label.name, strength: label.strength, contents: label.contents, how, ocrText: ocrText.slice(0, 2000), at });
      saved++;
    }
    writeManifest(entries);
    return saved;
  } catch {
    return 0;
  }
}

export function trainingSummary(): { photos: number; medicines: number } {
  const entries = readManifest();
  return { photos: entries.length, medicines: new Set(entries.map((e) => e.medicine)).size };
}

/** Shares a .zip of all saved photos with manifest.json (labels + what the phone read). */
export async function exportTraining(): Promise<boolean> {
  const entries = readManifest();
  if (!entries.length) return false;
  const files: { name: string; data: Uint8Array }[] = [
    { name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(entries, null, 1)) },
    {
      name: 'README.txt',
      data: new TextEncoder().encode(
        'MedSync training photos. Each folder is one medicine + strength, confirmed by a person in the app.\n' +
          'manifest.json lists every photo with its label, how it was confirmed, and the text the phone read.\n',
      ),
    },
  ];
  for (const e of entries) {
    const f = new File(dir(), ...e.file.split('/'));
    if (f.exists) files.push({ name: e.file, data: f.bytesSync() });
  }
  const out = new File(Paths.cache, `medsync-training-${new Date().toISOString().slice(0, 10)}.zip`);
  if (out.exists) out.delete();
  out.create();
  out.write(makeZip(files));
  await Sharing.shareAsync(out.uri, { mimeType: 'application/zip', dialogTitle: 'Export training photos' });
  return true;
}

export function clearTraining() {
  try {
    const d = dir();
    if (d.exists) d.delete();
  } catch {
    // nothing to clear
  }
}
