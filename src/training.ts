// Optional collection of confirmed scan photos, labelled with the medicine, for training an image model later.
// Off by default. Photos stay on the phone until the person exports them.

import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Sharing from 'expo-sharing';
import { lookupBrand } from './drugdb.ts';
import { boxesFor } from './ocr.ts';
import { labelRegions, REGION_CLASSES, toYolo } from './regions.ts';
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
  yolo?: string; // auto-labelled boxes, YOLO format (class cx cy w h, relative) — from the phone's text reader
  regions?: { cls: string; text: string }[]; // what each box said, to help when checking labels
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
      // Auto-label where the brand, contents and strength are printed (boxes are relative, so resizing is fine).
      const info = boxesFor(uris[i]);
      const ingredients = label.contents
        ? label.contents.split('+').map((x) => x.replace(/\d.*$/, '').trim())
        : lookupBrand(label.name)?.ingredients;
      const regions = info ? labelRegions(info.boxes, { name: label.name, strength: label.strength, ingredients }) : [];
      entries.push({
        file: `${safe(medicine)}/${fileName}`,
        medicine,
        name: label.name,
        strength: label.strength,
        contents: label.contents,
        how,
        ocrText: ocrText.slice(0, 2000),
        at,
        yolo: info ? toYolo(regions, info) : undefined,
        regions: regions.map((r) => ({ cls: r.cls, text: r.text })),
      });
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
  // YOLO layout: images/<stem>.jpg + labels/<stem>.txt (+ data.yaml), ready for the scripts in training/.
  const enc = new TextEncoder();
  let labelled = 0;
  for (const e of entries) {
    const f = new File(dir(), ...e.file.split('/'));
    if (!f.exists) continue;
    const stem = e.file.replace(/\.jpg$/i, '').replace(/[\/]+/g, '__');
    files.push({ name: `images/${stem}.jpg`, data: f.bytesSync() });
    if (e.yolo !== undefined) {
      files.push({ name: `labels/${stem}.txt`, data: enc.encode(e.yolo) });
      labelled++;
    }
  }
  files.push({
    name: 'data.yaml',
    data: enc.encode(`# MedSync strip regions\npath: .\ntrain: images\nval: images\nnames:\n${REGION_CLASSES.map((c, i) => `  ${i}: ${c}`).join('\n')}\n`),
  });
  files[1] = {
    name: 'README.txt',
    data: enc.encode(
      'MedSync training photos, confirmed by a person in the app.\n' +
        `images/ — ${entries.length} photos. labels/ — ${labelled} auto-labelled (YOLO: class cx cy w h). Classes: ${REGION_CLASSES.join(', ')}.\n` +
        'Photos without a label file were saved before auto-labelling; run training/autolabel.py to label them.\n' +
        'manifest.json — each photo with its medicine, how it was confirmed, the text read and the region texts.\n',
    ),
  };
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
