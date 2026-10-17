// Optional collection of confirmed scan photos, labelled with the medicine, for training an image model later.
// Off by default. Photos stay on the phone until the person exports them.

import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as MailComposer from 'expo-mail-composer';
import * as Sharing from 'expo-sharing';
import { lookupBrand } from './drugdb.ts';
import { boxesFor, lastReader, traceFor } from './ocr.ts';
import { describeTrace, regionsToYolo, traceSvg, type ScanTrace } from './scanTrace.ts';
import { labelRegions, REGION_CLASSES, toYolo } from './regions.ts';
import { makeZip } from './zip.ts';
import { photoFileName, uuid } from './uid.ts';

import { TRAINING_AVAILABLE } from './edition.ts';

export interface TrainingEntry {
  file: string; // path inside the export, e.g. "Monotrate 10/2026-10-12T09-30-00-1.jpg"
  medicine: string; // "Monotrate 10"
  name: string;
  strength: string;
  contents?: string; // "Isosorbide Mononitrate 10 mg"
  how: 'dose-check' | 'taught' | 'scan-to-add' | 'test-scan' | 'failed-scan' | 'failed-add' | 'imported';
  /** Imported photos (spec 13): whether the scanner recognised the strip as the medicine the person named. */
  scan?: 'recognised' | 'name only' | 'not recognised';
  /** Not confirmed by a person: the scan failed or was closed. Exported under unlabelled/ to be named on a computer. */
  unlabelled?: boolean;
  reason?: string; // why it wasn't confirmed, e.g. the red result's message
  ocrText: string;
  at: string;
  yolo?: string; // auto-labelled boxes, YOLO-OBB format (class x1 y1 … x4 y4, relative) — from the phone's text reader
  regions?: { cls: string; text: string }[]; // what each box said, to help when checking labels
  reader?: string; // which text reader read it: "apple-vision" or "ml-kit"
  sentAt?: string; // when it was emailed with "Send for training"
  phone?: string; // which phone took it (a random id per install), so photos from several friends can be told apart
  /** What each scan step saw on this photo: detector boxes and the text of every reading (spec 12). */
  trace?: ScanTrace;
}

const dir = () => new Directory(Paths.document, 'training');

/** A random id for this install, made once and kept with the training photos. */
export function phoneId(): string {
  try {
    const root = dir();
    if (!root.exists) root.create({ intermediates: true });
    const f = new File(root, 'phone-id.txt');
    if (f.exists) {
      const id = f.textSync().trim();
      if (id) return id;
    }
    const id = uuid();
    if (!f.exists) f.create();
    f.write(id);
    return id;
  } catch {
    return 'unknown';
  }
}
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
  const root = dir();
  if (!root.exists) root.create({ intermediates: true });
  const f = manifestFile();
  if (!f.exists) f.create();
  f.write(JSON.stringify(entries, null, 1));
}

/**
 * Adds entries to the manifest. Reads and writes in one synchronous step, after all photo work is done: reading
 * at the start of a save and writing at the end let two saves running together (a failed scan, then a quick
 * confirmed one) overwrite each other's entries.
 */
function appendEntries(added: TrainingEntry[]) {
  if (!added.length) return;
  writeManifest([...readManifest(), ...added]);
}

/** Changes entries in the manifest, again in one synchronous step. */
function updateEntries(change: (e: TrainingEntry) => TrainingEntry) {
  writeManifest(readManifest().map(change));
}

// Saves run one after another, so photo files and their manifest entries never interleave.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

/** Saves photos of a confirmed strip (resized to 1280 px wide JPEG). Returns how many were saved. */
export async function saveTrainingPhotos(
  uris: string[],
  label: { name: string; strength: string; contents?: string },
  how: TrainingEntry['how'],
  ocrText: string,
  extra: Pick<TrainingEntry, 'scan'> = {},
): Promise<number> {
  if (!TRAINING_AVAILABLE) return 0; // store builds keep no training photos (src/edition.ts)
  if (!uris.length) return 0;
  return serial(() => saveLabelled(uris, label, how, ocrText, extra));
}

async function saveLabelled(
  uris: string[],
  label: { name: string; strength: string; contents?: string },
  how: TrainingEntry['how'],
  ocrText: string,
  extra: Pick<TrainingEntry, 'scan'>,
): Promise<number> {
  const added: TrainingEntry[] = [];
  try {
    const root = dir();
    if (!root.exists) root.create({ intermediates: true });
    const medicine = `${label.name} ${label.strength}`.trim();
    const folder = new Directory(root, safe(medicine));
    if (!folder.exists) folder.create({ intermediates: true });
    const at = new Date().toISOString();
    for (let i = 0; i < uris.length; i++) {
      const ref = await ImageManipulator.manipulate(uris[i]).resize({ width: 1280 }).renderAsync();
      const img = await ref.saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
      const fileName = photoFileName(at, i + 1);
      await new File(img.uri).copy(new File(folder, fileName));
      // Auto-label where the brand, contents and strength are printed (boxes are relative, so resizing is fine).
      const info = boxesFor(uris[i]);
      const ingredients = label.contents
        ? label.contents.split('+').map((x) => x.replace(/\d.*$/, '').trim())
        : lookupBrand(label.name)?.ingredients;
      const regions = info ? labelRegions(info.boxes, { name: label.name, strength: label.strength, ingredients }) : [];
      added.push({
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
        trace: traceFor(uris[i]),
        phone: phoneId(),
        ...extra,
      });
    }
  } catch {
    // keep whatever was saved before the failure
  }
  appendEntries(added);
  return added.length;
}

const UNLABELLED = '_unlabelled';

/**
 * Keeps photos of a scan nobody confirmed (red result, unreadable, or closed): the strips the reader finds hardest,
 * so the most useful ones for retraining. No medicine label; exported separately under unlabelled/.
 */
export async function saveUnlabelledPhotos(uris: string[], how: 'failed-scan' | 'failed-add' | 'test-scan' | 'imported', reason: string, ocrText: string): Promise<string[]> {
  if (!TRAINING_AVAILABLE) return []; // store builds keep no training photos (src/edition.ts)
  if (!uris.length) return [];
  return serial(async () => {
    const added: TrainingEntry[] = [];
    try {
      const folder = new Directory(dir(), UNLABELLED);
      if (!folder.exists) folder.create({ intermediates: true });
      const at = new Date().toISOString();
      for (let i = 0; i < uris.length; i++) {
        try {
          const ref = await ImageManipulator.manipulate(uris[i]).resize({ width: 1280 }).renderAsync();
          const img = await ref.saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
          const fileName = photoFileName(at, i + 1);
          await new File(img.uri).copy(new File(folder, fileName));
          added.push({ file: `${UNLABELLED}/${fileName}`, medicine: '', name: '', strength: '', how, unlabelled: true, reason, ocrText: ocrText.slice(0, 2000), at, reader: lastReader(), trace: traceFor(uris[i]), phone: phoneId() });
        } catch {
          // The camera's copy may already be gone; keep the others.
        }
      }
    } catch {
      // keep whatever was saved before the failure
    }
    appendEntries(added);
    return added.map((e) => e.file);
  });
}

/**
 * Photos saved on disk but missing from the manifest (lost by the overwrite fixed above) are added back:
 * those in _unlabelled/ as failed scans, those in a medicine folder under that folder's name, without auto-labels.
 */
export function recoverOrphans(): number {
  try {
    const root = dir();
    if (!root.exists) return 0;
    const known = new Set(readManifest().map((e) => e.file));
    const found: TrainingEntry[] = [];
    for (const item of root.list()) {
      if (!(item instanceof Directory)) continue;
      const folder = item.name;
      for (const f of item.list()) {
        if (!(f instanceof File) || !/\.jpe?g$/i.test(f.name)) continue;
        const file = `${folder}/${f.name}`;
        if (known.has(file)) continue;
        const at = (f.modificationTime ? new Date(f.modificationTime) : new Date()).toISOString();
        found.push(
          folder === UNLABELLED
            ? { file, medicine: '', name: '', strength: '', how: 'failed-scan', unlabelled: true, reason: 'Recovered: saved from a failed scan, details lost.', ocrText: '', at }
            : { file, medicine: folder, name: folder, strength: '', how: 'dose-check', ocrText: '', at },
        );
      }
    }
    appendEntries(found);
    return found.length;
  } catch {
    return 0;
  }
}

/**
 * Names a photo that was saved unlabelled earlier this session (e.g. "Looks like Pantodac 40? — Yes"), with the same
 * auto-labels a labelled save gets. `sourceUri` is the photo as it was read (its text boxes are still in memory).
 */
export function labelSavedPhoto(file: string, sourceUri: string, label: { name: string; strength: string }, scan?: TrainingEntry['scan']) {
  const info = boxesFor(sourceUri);
  const ingredients = lookupBrand(label.name)?.ingredients;
  const regions = info ? labelRegions(info.boxes, { name: label.name, strength: label.strength, ingredients }) : [];
  const medicine = `${label.name} ${label.strength}`.trim();
  updateEntries((e) =>
    e.file === file
      ? {
          ...e,
          unlabelled: false,
          reason: undefined,
          medicine,
          name: label.name,
          strength: label.strength,
          yolo: info && regions.length ? toYolo(regions, info) : undefined,
          regions: regions.map((r) => ({ cls: r.cls, text: r.text })),
          ...(scan ? { scan } : {}),
        }
      : e,
  );
}

export function trainingSummary(): { photos: number; medicines: number; unlabelled: number; unsent: number } {
  recoverOrphans();
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
  let traced = 0;
  for (const e of entries) {
    const f = new File(dir(), ...e.file.split('/'));
    if (!f.exists) continue;
    included.push(e);
    const stem = e.file.replace(/\.jpg$/i, '').replace(/[\/]+/g, '__');
    if (e.trace) {
      // Both steps of the scan, for every photo: the detector's boxes (to load into CVAT and correct) and a readable
      // account of what was read at each step — so a failed scan shows whether finding or reading went wrong.
      traced++;
      if (e.trace.regions.length) files.push({ name: `predictions/${stem}.txt`, data: enc.encode(regionsToYolo(e.trace)) });
      const header = [
        `Photo: ${e.unlabelled ? 'unlabelled' : 'images'}/${stem}.jpg`,
        `Medicine: ${e.medicine || '(not known)'} · how: ${e.how}${e.reason ? ` · ${e.reason}` : ''}`,
        `When: ${e.at}`,
        '',
      ];
      files.push({ name: `scans/${stem}.txt`, data: enc.encode(describeTrace(e.trace, header)) });
      // The same photo with the boxes drawn on it (the clean photo stays in images/ or unlabelled/).
      files.push({ name: `boxed/${stem}.svg`, data: enc.encode(traceSvg(e.trace, `../${e.unlabelled ? 'unlabelled' : 'images'}/${stem}.jpg`, header)) });
    }
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
    data: enc.encode(`# TakeSure strip regions\npath: .\ntrain: images\nval: images\nnames:\n${REGION_CLASSES.map((c, i) => `  ${i}: ${c}`).join('\n')}\n`),
  });
  files.push({
    name: 'README.txt',
    data: enc.encode(
      'TakeSure training photos.\n' +
        `images/ — ${included.length - unlabelled} photos confirmed by a person. labels/ — ${labelled} auto-labelled (YOLO-OBB rotated boxes: class x1 y1 x2 y2 x3 y3 x4 y4). Classes: ${REGION_CLASSES.join(', ')}.\n` +
        'Photos without a label file: run training/autolabel.py to label them.\n' +
        `unlabelled/ — ${unlabelled} photos from scans nobody confirmed (red, unreadable or closed); "reason" in manifest.json says why. ` +
        'Name them (CVAT, or training/autolabel.py --folder … --label "Name 10"), then add them to images/ and labels/.\n' +
        `Each photo comes twice: clean (images/ or unlabelled/) and with the boxes drawn on it (boxed/<photo>.svg — open in a browser; ` +
        'solid boxes were cropped and read, dashed ones were not). ' +
        `predictions/ — the region detector's boxes (YOLO-OBB with the confidence last; load into CVAT to correct). scans/ — ${traced} readable accounts of each scan: what the detector found and the text read at every step. ` +
        'training/review.py makes JPEG versions of the boxed photos.\n' +
        'manifest.json — each photo with its medicine, how it was confirmed, the text read, which reader read it, the region texts and "trace" (the scan steps).\n',
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
  recoverOrphans();
  const entries = readManifest();
  if (!entries.length) return false;
  const { file } = buildZip(entries, `medsync-training-${today()}-${phoneId().slice(0, 8)}-${uuid()}.zip`);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/zip', dialogTitle: 'Export training photos' });
  return true;
}

/** Where "Send for training" addresses its email. */
export const TRAINING_EMAIL = 'paniaron@gmail.com';
const EMAIL_LIMIT = 18 * 1024 * 1024; // Gmail takes 25 MB per email; attachments grow about a third when sent

export type SendResult =
  | { kind: 'sent' | 'opened'; photos: number; left: number }
  | { kind: 'shared'; photos: number; left: number; files: string[] } // share sheet closed; ask whether it was sent
  | { kind: 'cancelled' | 'nothing' };

/** Forgets which photos were sent, so the next Send for training sends all of them again (an email that never arrived). */
export function unmarkAllSent(): number {
  let n = 0;
  updateEntries((e) => {
    if (!e.sentAt) return e;
    n++;
    const { sentAt: _drop, ...rest } = e;
    return rest;
  });
  return n;
}

/** Marks photos as sent (after the person confirms a share-sheet send went out). */
export function markSent(files: string[]) {
  const sentAt = new Date().toISOString();
  const ids = new Set(files);
  updateEntries((e) => (ids.has(e.file) ? { ...e, sentAt } : e)); // re-read: photos saved meanwhile stay
}

/**
 * Sends the photos not sent before as one zip to TRAINING_EMAIL; the person presses Send.
 * With Apple Mail / an Android mail app: opens a ready email (address, subject, zip attached).
 * Without (e.g. only the Gmail app on iPhone, where the ready-email screen isn't available): opens the share sheet
 * with the zip, to send with Gmail, Outlook or WhatsApp to TRAINING_EMAIL — the caller asks afterwards whether it was
 * sent, because the share sheet can't tell. Big collections go in parts small enough for email.
 */
/** Whether a ready-made email can be opened (Apple Mail on iPhone with an account set up, or a mail app on Android). */
export async function mailAppAvailable(): Promise<boolean> {
  try {
    return await MailComposer.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function emailTraining(buildLabel: string, via: 'mail' | 'share' = 'mail'): Promise<SendResult> {
  recoverOrphans();
  const unsent = readManifest().filter((e) => !e.sentAt && new File(dir(), ...e.file.split('/')).exists);
  if (!unsent.length) return { kind: 'nothing' };
  const batch: TrainingEntry[] = [];
  let bytes = 0;
  for (const e of unsent) {
    const size = new File(dir(), ...e.file.split('/')).size ?? 0;
    if (batch.length && bytes + size > EMAIL_LIMIT) break;
    batch.push(e);
    bytes += size;
  }
  const { file, photos } = buildZip(batch, `medsync-training-${today()}-${phoneId().slice(0, 8)}-${uuid()}.zip`);
  const unl = batch.filter((e) => e.unlabelled).length;
  const meds = new Set(batch.filter((e) => !e.unlabelled).map((e) => e.medicine));
  const left = unsent.length - batch.length;
  const files = batch.map((e) => e.file);
  if (via === 'mail' && (await mailAppAvailable())) {
    try {
      const res = await MailComposer.composeAsync({
        recipients: [TRAINING_EMAIL],
        subject: `TakeSure training photos ${today()} (${photos})`,
        body:
          `${photos - unl} labelled photos of ${meds.size} medicine${meds.size === 1 ? '' : 's'}` +
          (unl ? ` and ${unl} unlabelled (failed scans)` : '') +
          `.\nApp: ${buildLabel}\n` +
          (left ? `\n${left} more photos to send — tap "Send for training" again after this.\n` : '') +
          '\nUnzip and use with the scripts in training/ (see training/README.md).',
        attachments: [file.uri],
      });
      if (res.status === MailComposer.MailComposerStatus.CANCELLED) return { kind: 'cancelled' };
      if (res.status === MailComposer.MailComposerStatus.SENT) {
        markSent(files);
        return { kind: 'sent', photos, left };
      }
      // Saved as a draft (iPhone) or unknown (Android can't tell sent from saved): ask, like the share sheet.
      return { kind: 'shared', photos, left, files };
    } catch {
      // fall through to the share sheet
    }
  }
  await Sharing.shareAsync(file.uri, { mimeType: 'application/zip', dialogTitle: `Send to ${TRAINING_EMAIL}`, UTI: 'public.zip-archive' });
  return { kind: 'shared', photos, left, files };
}

export function clearTraining() {
  try {
    const d = dir();
    if (d.exists) d.delete();
  } catch {
    // nothing to clear
  }
}
