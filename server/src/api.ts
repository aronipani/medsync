// The TakeSure API (see ../openapi.yaml and docs/specs/16-takesure-server.md).
//
// Strictly anonymous, by construction:
//  * No accounts, names, phone numbers, emails or device ids. An install token (tokens.ts) only rate-limits.
//  * Backups and family activity are encrypted ON THE PHONE with a key the server never receives. The server
//    stores ciphertext under ids derived from that key, so it can't read them or tell whose they are.
//  * Strip photos are cleaned of metadata, read by the model in memory and not kept.
//  * Logs hold the route, status and time taken — never bodies, ids, tokens or IP addresses.

import { randomBytes } from 'node:crypto';
import { HttpError, header, idParam, isObj, json, ok, type Req, type Res } from './http.ts';
import { cleanJpeg } from './jpeg.ts';
import { LIMITS, spend, spendModelBudget } from './limits.ts';
import { catalogueCore, catalogueKey, checkProfile, type ServerProfile } from './profile.ts';
import type { StripReader } from './model/reader.ts';
import type { Blobs, KV } from './store/store.ts';
import { installFrom, issueInstallToken, matchesHash, sha256 } from './tokens.ts';

export interface Deps {
  kv: KV;
  blobs: Blobs;
  reader: StripReader;
  installSecret: string;
  modelCallsPerDay: number;
  now?: () => number;
}

const DAY = 86_400;
const PHOTO_MAX = 1_500_000; // bytes per photo, after the phone's 1280 px re-save
const VAULT_MAX = 2_000_000; // encrypted backup
const VAULT_KEEP_DAYS = 400; // a backup not updated for this long is deleted
const EVENT_MAX = 2_048; // one encrypted activity event (base64 text)
const EVENT_KEEP_DAYS = 30;
const CIRCLE_KEEP_DAYS = 400;
export const CATALOGUE_MIN = 3; // confirmations before a catalogue profile is offered to other households
const CATALOGUE_KEEP_DAYS = 3 * 365;

type Handler = (req: Req, d: Required<Deps>, params: string[]) => Promise<Res>;

const routes: [string, RegExp, Handler][] = [
  ['GET', /^\/v1\/health$/, async () => ok({ ok: true })],
  ['POST', /^\/v1\/install$/, install],
  ['POST', /^\/v1\/strip\/read$/, stripRead],
  ['GET', /^\/v1\/catalogue$/, catalogueGet],
  ['POST', /^\/v1\/catalogue$/, catalogueAdd],
  ['PUT', /^\/v1\/vault\/([^/]+)$/, vaultPut],
  ['GET', /^\/v1\/vault\/([^/]+)$/, vaultGet],
  ['DELETE', /^\/v1\/vault\/([^/]+)$/, vaultDelete],
  ['POST', /^\/v1\/circle\/([^/]+)\/events$/, circlePost],
  ['GET', /^\/v1\/circle\/([^/]+)\/events$/, circleGet],
  ['DELETE', /^\/v1\/circle\/([^/]+)$/, circleDelete],
  ['POST', /^\/v1\/photos$/, photoAdd],
];

export async function handle(req: Req, deps: Deps): Promise<Res> {
  const d: Required<Deps> = { now: () => Date.now(), ...deps };
  try {
    for (const [method, re, h] of routes) {
      const m = re.exec(req.path);
      if (!m) continue;
      if (req.method !== method) continue;
      return await h(req, d, m.slice(1));
    }
    if (routes.some(([, re]) => re.test(req.path))) throw new HttpError(405, 'method_not_allowed');
    throw new HttpError(404, 'not_found');
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, body: { error: e.code, message: e.message } };
    console.error('internal', (e as Error).name); // name only: messages can carry request data
    return { status: 500, body: { error: 'internal' } };
  }
}

const secs = (d: Required<Deps>) => Math.floor(d.now() / 1000);
const month = (d: Required<Deps>) => new Date(d.now()).toISOString().slice(0, 7);

// ---------- Install ----------

async function install(_req: Req, d: Required<Deps>): Promise<Res> {
  await spend(d.kv, 'all', LIMITS.install, d.now());
  return ok({ token: issueInstallToken(d.installSecret) }, 201);
}

// ---------- Strip reading (spec 15) ----------

async function stripRead(req: Req, d: Required<Deps>): Promise<Res> {
  const who = installFrom(req, d.installSecret);
  const body = json<{ photos?: unknown }>(req, 4.5 * PHOTO_MAX);
  if (!isObj(body) || !Array.isArray(body.photos) || body.photos.length < 1 || body.photos.length > 2 || !body.photos.every((p) => typeof p === 'string')) {
    throw new HttpError(400, 'need_1_or_2_photos');
  }
  const photos = (body.photos as string[]).map((p) => cleanJpeg(Buffer.from(p, 'base64'), PHOTO_MAX));
  await spend(d.kv, who, LIMITS.stripRead, d.now());
  await spendModelBudget(d.kv, d.modelCallsPerDay, d.now());
  let raw: unknown;
  try {
    raw = await d.reader.read(photos);
  } catch {
    throw new HttpError(502, 'model_unavailable', 'Strip reading is not available right now; the phone reads the strip instead.');
  }
  const { profile, unsure } = checkProfile(raw);
  return ok({ profile: profile ?? null, unsure });
}

// ---------- Shared strip catalogue ----------
// Profiles helpers confirmed, keyed by brand + strength. Nothing about who confirmed is kept: only a count
// per variant (a variant = the same brand/strength/maker/contents/pocket grid). A variant is offered to other
// households only after CATALOGUE_MIN confirmations, and always as a draft the helper checks.

const variantOf = (p: ServerProfile) =>
  sha256(JSON.stringify([p.brand.toUpperCase(), p.strength.toUpperCase().replace(/\s/g, ''), p.maker?.toUpperCase() ?? '', p.generic?.toUpperCase() ?? '', p.grid ?? null])).slice(0, 16);

async function catalogueGet(req: Req, d: Required<Deps>): Promise<Res> {
  const who = installFrom(req, d.installSecret);
  const brand = req.query.brand?.slice(0, 40);
  const strength = req.query.strength?.slice(0, 30);
  if (!brand || !strength) throw new HttpError(400, 'need_brand_and_strength');
  await spend(d.kv, who, LIMITS.catalogueRead, d.now());
  const items = await d.kv.query(`CAT#${catalogueKey(brand, strength)}`, '', 50);
  const matches = items
    .filter((i) => Number(i.count) >= CATALOGUE_MIN)
    .sort((a, b) => Number(b.count) - Number(a.count))
    .slice(0, 3)
    .map((i) => ({ profile: i.profile, confirmations: Number(i.count) }));
  return ok({ matches });
}

async function catalogueAdd(req: Req, d: Required<Deps>): Promise<Res> {
  const who = installFrom(req, d.installSecret);
  const body = json<{ profile?: unknown }>(req, 20_000);
  const { profile } = checkProfile(isObj(body) ? { ...(isObj(body.profile) ? body.profile : {}), confidence: undefined } : undefined);
  if (!profile) throw new HttpError(400, 'need_brand_and_strength');
  await spend(d.kv, who, LIMITS.catalogueAdd, d.now());
  const pk = `CAT#${catalogueKey(profile.brand, profile.strength)}`;
  const sk = `V#${variantOf(profile)}`;
  const expiresAt = secs(d) + CATALOGUE_KEEP_DAYS * DAY;
  if (!(await d.kv.get(pk, sk))) await d.kv.put({ pk, sk, profile: catalogueCore(profile), count: 0, version: 1, expiresAt }, { ifVersion: 0 });
  const count = await d.kv.incr(pk, sk, expiresAt);
  return ok({ confirmations: count, shared: count >= CATALOGUE_MIN }, 201);
}

// ---------- Encrypted backup vault ----------
// The phone makes a random 32-byte backup key and keeps it (and shows it as a recovery code / QR).
// From it the phone derives vaultId and vaultToken (HKDF, spec 16) and encrypts the backup (AES-256-GCM).
// The server stores the hash of vaultToken on the first save and the ciphertext; it keeps the previous
// version too, so one bad save can be undone.

async function vaultMeta(req: Req, d: Required<Deps>, id: string, create: boolean) {
  const token = header(req, 'x-vault-token');
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new HttpError(401, 'bad_vault_token');
  const meta = await d.kv.get(`VAULT#${id}`, 'meta');
  if (!meta) {
    if (create) return { meta: undefined, token };
    throw new HttpError(404, 'no_backup');
  }
  if (!matchesHash(token, meta.tokenHash)) throw new HttpError(403, 'wrong_vault_token');
  return { meta, token };
}

/** File holding the latest or previous backup. Older records (before per-upload names) used vault/<id>/<version>. */
function vaultBlob(id: string, meta: Record<string, unknown>, which: 'latest' | 'previous'): string | undefined {
  const v = Number(meta.version);
  if (which === 'latest') return typeof meta.blob === 'string' ? meta.blob : v > 0 ? `vault/${id}/${v}` : undefined;
  if (typeof meta.blob === 'string') return typeof meta.prevBlob === 'string' ? meta.prevBlob : undefined;
  return v > 1 ? `vault/${id}/${v - 1}` : undefined;
}

async function vaultPut(req: Req, d: Required<Deps>, [rawId]: string[]): Promise<Res> {
  const id = idParam(rawId, 'vault_id');
  const who = installFrom(req, d.installSecret);
  if (req.body.length < 28 || req.body.length > VAULT_MAX) throw new HttpError(413, 'backup_size');
  const { meta, token } = await vaultMeta(req, d, id, true);
  await spend(d.kv, who, LIMITS.vaultWrite, d.now());
  const current = meta ? Number(meta.version) : 0;
  const ifMatch = req.headers['if-match'];
  if (ifMatch !== undefined && Number(ifMatch) !== current) throw new HttpError(409, 'newer_backup_exists', 'Another phone saved a newer backup.');
  const version = current + 1;
  // Each upload gets its own file name, recorded in the meta item, so two saves racing for the same version never
  // write to (or delete) the same file: the loser only removes its own upload.
  const blob = `vault/${id}/${version}-${randomBytes(6).toString('base64url')}`;
  await d.blobs.put(blob, req.body, 'application/octet-stream');
  const written = await d.kv.put(
    {
      pk: `VAULT#${id}`,
      sk: 'meta',
      tokenHash: meta?.tokenHash ?? sha256(token),
      version,
      blob,
      prevBlob: meta ? vaultBlob(id, meta, 'latest') : undefined,
      size: req.body.length,
      savedMonth: month(d),
      expiresAt: secs(d) + VAULT_KEEP_DAYS * DAY,
    },
    { ifVersion: current },
  );
  if (!written) {
    await d.blobs.delete(blob);
    throw new HttpError(409, 'newer_backup_exists', 'Another phone saved a newer backup.');
  }
  // Keep this one and the one before; the one before that is no longer referenced.
  const twoAgo = meta ? vaultBlob(id, meta, 'previous') : undefined;
  if (twoAgo) await d.blobs.delete(twoAgo);
  return ok({ version }, 201);
}

async function vaultGet(req: Req, d: Required<Deps>, [rawId]: string[]): Promise<Res> {
  const id = idParam(rawId, 'vault_id');
  const who = installFrom(req, d.installSecret);
  const { meta } = await vaultMeta(req, d, id, false);
  await spend(d.kv, who, LIMITS.vaultRead, d.now());
  const latest = Number(meta!.version);
  const which = req.query.version === 'previous' ? 'previous' : 'latest';
  const version = which === 'previous' ? latest - 1 : latest;
  const key = vaultBlob(id, meta!, which);
  const data = key ? await d.blobs.get(key) : undefined;
  if (!data) throw new HttpError(404, 'no_backup');
  return { status: 200, headers: { 'content-type': 'application/octet-stream', 'x-vault-version': String(version) }, body: data };
}

async function vaultDelete(req: Req, d: Required<Deps>, [rawId]: string[]): Promise<Res> {
  const id = idParam(rawId, 'vault_id');
  installFrom(req, d.installSecret);
  const { meta } = await vaultMeta(req, d, id, false);
  const keys = [vaultBlob(id, meta!, 'latest'), vaultBlob(id, meta!, 'previous')].filter((k): k is string => !!k);
  await Promise.all(keys.map((k) => d.blobs.delete(k)));
  await d.kv.delete(`VAULT#${id}`, 'meta');
  return { status: 204 };
}

// ---------- Family circle: encrypted activity feed ----------
// Phones in a family share one circle key (by QR code or a WhatsApp link). Each phone posts encrypted
// events ("Ma took Clopilet 75 at 9:05", "dose missed", "stock low"); the others fetch them. The server
// sees only ciphertext, its size and when it arrived. Events are deleted after 30 days.

async function circleAuth(req: Req, d: Required<Deps>, id: string, create: boolean) {
  const token = header(req, 'x-circle-token');
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new HttpError(401, 'bad_circle_token');
  const meta = await d.kv.get(`CIRCLE#${id}`, 'meta');
  if (!meta) {
    if (!create) throw new HttpError(404, 'no_circle');
    const created = await d.kv.put({ pk: `CIRCLE#${id}`, sk: 'meta', tokenHash: sha256(token), version: 1, expiresAt: secs(d) + CIRCLE_KEEP_DAYS * DAY }, { ifVersion: 0 });
    if (!created) return circleAuth(req, d, id, false); // another phone created it a moment ago
    return;
  }
  if (!matchesHash(token, meta.tokenHash)) throw new HttpError(403, 'wrong_circle_token');
  if (create && Number(meta.expiresAt) - secs(d) < (CIRCLE_KEEP_DAYS - 1) * DAY) {
    await d.kv.put({ ...meta, expiresAt: secs(d) + CIRCLE_KEEP_DAYS * DAY }); // still in use: keep it
  }
}

async function circlePost(req: Req, d: Required<Deps>, [rawId]: string[]): Promise<Res> {
  const id = idParam(rawId, 'circle_id');
  const who = installFrom(req, d.installSecret);
  const body = json<{ events?: unknown }>(req, 25 * EVENT_MAX);
  if (!isObj(body) || !Array.isArray(body.events) || !body.events.length || body.events.length > 20) throw new HttpError(400, 'need_1_to_20_events');
  for (const e of body.events) if (typeof e !== 'string' || !/^[A-Za-z0-9+/=_-]{24,}$/.test(e) || e.length > EVENT_MAX) throw new HttpError(400, 'bad_event');
  await circleAuth(req, d, id, true);
  await spend(d.kv, who, LIMITS.circleWrite, d.now());
  const ids: string[] = [];
  for (const data of body.events as string[]) {
    const sk = `E#${String(d.now()).padStart(15, '0')}#${randomBytes(4).toString('hex')}`;
    await d.kv.put({ pk: `CIRCLE#${id}`, sk, data, expiresAt: secs(d) + EVENT_KEEP_DAYS * DAY });
    ids.push(sk);
  }
  return ok({ ids }, 201);
}

async function circleGet(req: Req, d: Required<Deps>, [rawId]: string[]): Promise<Res> {
  const id = idParam(rawId, 'circle_id');
  const who = installFrom(req, d.installSecret);
  await circleAuth(req, d, id, false);
  await spend(d.kv, who, LIMITS.circleRead, d.now());
  const after = req.query.after && /^E#\d{15}#[0-9a-f]{8}$/.test(req.query.after) ? req.query.after : 'E#';
  const items = await d.kv.query(`CIRCLE#${id}`, after, 200);
  const events = items.filter((i) => i.sk.startsWith('E#')).map((i) => ({ id: i.sk, at: Number(i.sk.slice(2, 17)), data: i.data }));
  return ok({ events, cursor: events.at(-1)?.id ?? after, more: items.length === 200 });
}

async function circleDelete(req: Req, d: Required<Deps>, [rawId]: string[]): Promise<Res> {
  const id = idParam(rawId, 'circle_id');
  installFrom(req, d.installSecret);
  await circleAuth(req, d, id, false);
  for (;;) {
    const items = await d.kv.query(`CIRCLE#${id}`, '', 200);
    if (!items.length) break;
    for (const i of items) await d.kv.delete(i.pk, i.sk);
  }
  return { status: 204 };
}

// ---------- Training photos (spec 07) ----------
// Opt-in, one photo at a time: the photo, a typed or picked medicine name, month, app version and platform.
// Helper test builds also send what the phone already knows about the strip (spec 16, "training details"): its
// strength and contents, how the photo was taken, why a scan failed, the text read and the auto-labelled boxes.
// Every field is whitelisted and capped; nothing about the person (no time, phone id or family member) is kept.
// The server cleans the JPEG again and files it by month.

const TRAINING_HOW = ['dose-check', 'taught', 'scan-to-add', 'test-scan', 'failed-scan', 'failed-add', 'imported'];
const TRAINING_DETAILS_MAX = 60_000; // bytes of JSON for the details of one photo

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : undefined);

/** Keeps only the known training fields, each capped. Unknown fields are dropped. */
export function trainingDetails(v: unknown): Record<string, unknown> {
  if (!isObj(v)) return {};
  const o = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const strength = str(o.strength, 30);
  if (strength) out.strength = strength;
  const contents = str(o.contents, 120);
  if (contents) out.contents = contents;
  if (typeof o.how === 'string' && TRAINING_HOW.includes(o.how)) out.how = o.how;
  if (o.scan === 'recognised' || o.scan === 'name only' || o.scan === 'not recognised') out.scan = o.scan;
  if (o.unlabelled === true) out.unlabelled = true;
  const reason = str(o.reason, 200);
  if (reason) out.reason = reason;
  if (o.reader === 'apple-vision' || o.reader === 'ml-kit') out.reader = o.reader;
  if (typeof o.ocrText === 'string') out.ocrText = o.ocrText.slice(0, 2000);
  if (typeof o.yolo === 'string' && /^[\d.\s-]*$/.test(o.yolo)) out.yolo = o.yolo.slice(0, 4000);
  if (Array.isArray(o.regions))
    out.regions = o.regions
      .filter(isObj)
      .slice(0, 20)
      .map((r) => ({ cls: str((r as Record<string, unknown>).cls, 20) ?? '', text: str((r as Record<string, unknown>).text, 120) ?? '' }));
  if (isObj(o.trace) && JSON.stringify(o.trace).length <= TRAINING_DETAILS_MAX / 2) out.trace = o.trace;
  return JSON.stringify(out).length <= TRAINING_DETAILS_MAX ? out : { ...out, trace: undefined, ocrText: undefined };
}

async function photoAdd(req: Req, d: Required<Deps>): Promise<Res> {
  const who = installFrom(req, d.installSecret);
  const body = json<Record<string, unknown>>(req, 1.4 * PHOTO_MAX + TRAINING_DETAILS_MAX + 2_000);
  if (!isObj(body) || typeof body.photo !== 'string') throw new HttpError(400, 'need_photo');
  const photo = cleanJpeg(Buffer.from(body.photo, 'base64'), PHOTO_MAX);
  const name = typeof body.name === 'string' ? body.name.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
  const record = {
    ...(name ? { name } : {}),
    month: month(d),
    appVersion: typeof body.appVersion === 'string' ? body.appVersion.slice(0, 40) : '',
    platform: body.platform === 'ios' || body.platform === 'android' ? body.platform : 'unknown',
    ...trainingDetails(body.details),
  };
  await spend(d.kv, who, LIMITS.photo, d.now());
  const key = `training/${record.month}/${randomBytes(12).toString('base64url')}`;
  await d.blobs.put(`${key}.jpg`, photo, 'image/jpeg');
  await d.blobs.put(`${key}.json`, Buffer.from(JSON.stringify(record)), 'application/json');
  return { status: 201, body: { ok: true } };
}
