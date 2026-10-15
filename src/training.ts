// Optional collection of confirmed scan photos, labelled with the medicine, for training an image model later.
// Off by default. Photos stay on the phone until the person exports them.

import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as MailComposer from 'expo-mail-composer';
import * as Sharing from 'expo-sharing';
import { lookupBrand } from './drugdb.ts';
import { boxesFor, lastReader } from './ocr.ts';
import { labelRegions, REGION_CLASSES, toYolo } from './regions.ts';
import { makeZip } from './zip.ts';

export interface TrainingEntry {
  file: string; // path inside the export, e.g. "Monotrate 10/2026-10-12T09-30-00-1.jpg"
  medicine: string; // "Monotrate 10"
  name: string;
  strength: string;
  contents?: string; // "Isosorbide Mononitrate 10 mg"
  how: 'dose-check' | 'taught' | 'scan-to-add' | 'failed-scan' | 'failed-add';
  /** Not confirmed by a person: the scan failed or was closed. Exported under unlabelled/ to be named on a computer. */
  unlabelled?: boolean;
  reason?: string; // why it wasn't confirmed, e.g. the red result's message
  ocrText: string;
  at: string;
  yolo?: string; // auto-labelled boxes, YOLO-OBB format (class x1 y1 … x4 y4, relative) — from the phone's text reader
  regions?: { cls: string; text: string }[]; // what each box said, to help when checking labels
  reader?: string; // which text reader read it: "apple-vision" or "ml-kit"
  sentAt?: string; // when it was emailed with "Send for training"
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
        // No boxes found means "not labelled yet", not "nothing here": an empty label file would teach the model the strip has no name.
        yolo: info && regions.length ? toYolo(regions, info) : undefined,
        regions: regions.map((r) => ({ cls: r.cls, text: r.text })),
        reader: lastReader(),
      });
      saved++;
    }
    writeManifest(entries);
    return saved;
  } catch {
    return 0;
  }
}

const UNLABELLED = '_unlabelled';

/**
 * Keeps photos of a scan nobody confirmed (red result, unreadable, or closed): the strips the reader finds hardest,
 * so the most useful ones for retraining. No medicine label; exported separately under unlabelled/.
 */
export async function saveUnlabelledPhotos(uris: string[], how: 'failed-scan' | 'failed-add', reason: string, ocrText: string): Promise<number> {
  if (!uris.length) return 0;
  try {
    const folder = new Directory(dir(), UNLABELLED);
    if (!folder.exists) folder.create({ intermediates: true });
    const entries = readManifest();
    const at = new Date().toISOString();
    let saved = 0;
    for (let i = 0; i < uris.length; i++) {
      try {
        const ref = await ImageManipulator.manipulate(uris[i]).resize({ width: 1280 }).renderAsync();
        const img = await ref.saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
        const fileName = `${at.replace(/[:.]/g, '-')}-${i + 1}.jpg`;
        await new File(img.uri).copy(new File(folder, fileName));
        entries.push({ file: `${UNLABELLED}/${fileName}`, medicine: '', name: '', strength: '', how, unlabelled: true, reason, ocrText: ocrText.slice(0, 2000), at, reader: lastReader() });
        saved++;
      } catch {
        // The camera's copy may already be gone; keep the others.
      }
    }
    writeManifest(entries);
    return saved;
  } catch {
    return 0;
  }
}

export function trainingSummary(): { photos: number; medicines: number; unlabelled: number; unsent: number } {
  const entries = readManifest();
  const labelled = entries.filter((e) => !e.unlabelled);
  return {
    photos: entries.length,
    medicines: new Set(labelled.map((e) => e.medicine)).size,
    unlabelled: entries.length - labelled.length,
    unsent: entries.filter((e) => !e.sentAt).length,
  };
}

/** Builds the export zip for these entries: YOLO layout (images/, labels/, data.yaml), unlabelled/, manifest and README. */
function buildZip(entries: TrainingEntry[], name: string): { file: File; photos: number } {
  const enc = new TextEncoder();
  const files: { name: string; data: Uint8Array }[] = [];
  const included: TrainingEntry[] = [];
  let labelled = 0;
  let unlabelled = 0;
  for (const e of entries) {
    const f = new File(dir(), ...e.file.split('/'));
    if (!f.exists) continue;
    included.push(e);
    const stem = e.file.replace(/\.jpg$/i, '').replace(/[\/]+/g, '__');
    if (e.unlabelled) {
      // Kept out of images/ so training never takes them for photos with nothing on them.
      files.push({ name: `unlabelled/${stem}.jpg`, data: f.bytesSync() });
      unlabelled++;
      continue;
    }
    files.push({ name: `images/${stem}.jpg`, data: f.bytesSync() });
    if (e.yolo !== undefined) {
      files.push({ name: `labels/${stem}.txt`, data: enc.encode(e.yolo) });
      labelled++;
    }
  }
  files.push({ name: 'manifest.json', data: enc.encode(JSON.stringify(included, null, 1)) });
  files.push({
    name: 'data.yaml',
    data: enc.encode(`# MedSync strip regions\npath: .\ntrain: images\nval: images\nnames:\n${REGION_CLASSES.map((c, i) => `  ${i}: ${c}`).join('\n')}\n`),
  });
  files.push({
    name: 'README.txt',
    data: enc.encode(
      'MedSync training photos.\n' +
        `images/ — ${included.length - unlabelled} photos confirmed by a person. labels/ — ${labelled} auto-labelled (YOLO-OBB rotated boxes: class x1 y1 x2 y2 x3 y3 x4 y4). Classes: ${REGION_CLASSES.join(', ')}.\n` +
        'Photos without a label file: run training/autolabel.py to label them.\n' +
        `unlabelled/ — ${unlabelled} photos from scans nobody confirmed (red, unreadable or closed); "reason" in manifest.json says why. ` +
        'Name them (CVAT, or training/autolabel.py --folder … --label "Name 10"), then add them to images/ and labels/.\n' +
        'manifest.json — each photo with its medicine, how it was confirmed, the text read, which reader read it and the region texts.\n',
    ),
  });
  const out = new File(Paths.cache, name);
  if (out.exists) out.delete();
  out.create();
  out.write(makeZip(files));
  return { file: out, photos: included.length };
}

const today = () => new Date().toISOString().slice(0, 10);

/** Shares a .zip of all saved photos with manifest.json (labels + what the phone read). */
export async function exportTraining(): Promise<boolean> {
  const entries = readManifest();
  if (!entries.length) return false;
  const { file } = buildZip(entries, `medsync-training-${today()}.zip`);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/zip', dialogTitle: 'Export training photos' });
  return true;
}

/** Where "Send for training" addresses its email. */
export const TRAINING_EMAIL = 'paniaron@gmail.com';
const EMAIL_LIMIT = 18 * 1024 * 1024; // Gmail takes 25 MB per email; attachments grow about a third when sent

export type SendResult =
  | { kind: 'sent' | 'opened'; photos: number; left: number }
  | { kind: 'cancelled' | 'nothing' | 'no-mail' };

/**
 * Opens an email to TRAINING_EMAIL with the photos not sent before attached as one zip; the person presses Send.
 * Big collections go in parts small enough for email ("send again for the rest").
 * Photos are marked sent once the mail app says so (iPhone) or the email was opened and not cancelled (Android
 * can't tell sent from saved).
 */
export async function emailTraining(buildLabel: string): Promise<SendResult> {
  if (!(await MailComposer.isAvailableAsync())) return { kind: 'no-mail' };
  const all = readManifest();
  const unsent = all.filter((e) => !e.sentAt && new File(dir(), ...e.file.split('/')).exists);
  if (!unsent.length) return { kind: 'nothing' };
  const batch: TrainingEntry[] = [];
  let bytes = 0;
  for (const e of unsent) {
    const size = new File(dir(), ...e.file.split('/')).size ?? 0;
    if (batch.length && bytes + size > EMAIL_LIMIT) break;
    batch.push(e);
    bytes += size;
  }
  const { file, photos } = buildZip(batch, `medsync-training-${today()}-${batch.length}.zip`);
  const unl = batch.filter((e) => e.unlabelled).length;
  const meds = new Set(batch.filter((e) => !e.unlabelled).map((e) => e.medicine));
  const left = unsent.length - batch.length;
  const res = await MailComposer.composeAsync({
    recipients: [TRAINING_EMAIL],
    subject: `MedSync training photos ${today()} (${photos})`,
    body:
      `${photos - unl} confirmed photos of ${meds.size} medicine${meds.size === 1 ? '' : 's'}` +
      (unl ? ` and ${unl} from failed scans` : '') +
      `.\nApp: ${buildLabel}\n` +
      (left ? `\n${left} more photos to send — tap "Send for training" again after this.\n` : '') +
      '\nUnzip and use with the scripts in training/ (see training/README.md).',
    attachments: [file.uri],
  });
  if (res.status === MailComposer.MailComposerStatus.CANCELLED) return { kind: 'cancelled' };
  const sentAt = new Date().toISOString();
  const ids = new Set(batch.map((e) => e.file));
  writeManifest(all.map((e) => (ids.has(e.file) ? { ...e, sentAt } : e)));
  return { kind: res.status === MailComposer.MailComposerStatus.SENT ? 'sent' : 'opened', photos, left };
}

export function clearTraining() {
  try {
    const d = dir();
    if (d.exists) d.delete();
  } catch {
    // nothing to clear
  }
}
