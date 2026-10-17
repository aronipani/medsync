// Reference photos of a medicine's strip (spec 15), kept on the phone in documents/profiles/.
// Small copies (480 px wide): enough to compare how a strip looks, ~30 KB each, at most 6 per medicine.
// Not included in backups (spec 01 leaves photos out); a restored profile simply starts collecting again.

import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { addRef } from './stripProfile.ts';
import type { StripProfile } from './types.ts';

const dir = () => new Directory(Paths.document, 'profiles');

/** Saves a small copy of a strip photo; returns its file name. */
export async function saveReference(photoUri: string): Promise<string> {
  const d = dir();
  if (!d.exists) d.create({ intermediates: true });
  const ref = await ImageManipulator.manipulate(photoUri).resize({ width: 480 }).renderAsync();
  const img = await ref.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  const name = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}.jpg`;
  new File(img.uri).copy(new File(d, name));
  return name;
}

export function referenceUri(name: string): string | undefined {
  const f = new File(dir(), name);
  return f.exists ? f.uri : undefined;
}

export function deleteReferences(names: string[] | undefined) {
  for (const n of names ?? []) {
    try {
      const f = new File(dir(), n);
      if (f.exists) f.delete();
    } catch {
      // already gone
    }
  }
}

/**
 * Adds a confirmed dose scan's photo to the rolling references (newest first; the oldest beyond four is deleted).
 * The fresh-strip anchors are never touched here.
 */
export async function withNewReference(profile: StripProfile, photoUri: string): Promise<StripProfile> {
  // Profiles from build ios-47 kept the fresh-strip photo among the rolling ones: its oldest photo becomes the anchor.
  if (!profile.anchors && profile.refs?.length) profile = { ...profile, anchors: profile.refs.slice(-1), refs: profile.refs.slice(0, -1) };
  const name = await saveReference(photoUri);
  const { refs, drop } = addRef(profile.refs, name);
  deleteReferences(drop);
  return { ...profile, refs };
}

/**
 * Sets the fresh-strip photos (one per side) from "Scan this strip once". Scanning a new strip replaces the
 * old anchors — a new pack design should be the one remembered — and the old files are deleted.
 */
export async function withAnchors(profile: StripProfile, photoUris: string[]): Promise<StripProfile> {
  const names: string[] = [];
  for (const uri of photoUris.slice(0, 2)) {
    try {
      names.push(await saveReference(uri));
    } catch {
      // a photo is a bonus; the words are what matter today
    }
  }
  if (!names.length) return profile;
  deleteReferences(profile.anchors);
  return { ...profile, anchors: names };
}
