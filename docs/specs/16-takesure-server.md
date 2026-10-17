# Spec 16 — The TakeSure server (one central, strictly anonymous backend)

## Problem
Several features need a server: reading a new strip with a frontier model (spec 15), a shared catalogue of strips
so the next household doesn't need the model, backups that survive a lost phone, sharing medicine activity with
family (taken / missed / low stock), and opt-in training photos (spec 07). Each family running its own server is
not realistic; one standard TakeSure server is. But it holds health data for many families, so it must be built so
that **even TakeSure cannot tell who anyone is or read their medicines**.

Code: `server/` (TypeScript, AWS Lambda). API: `server/openapi.yaml`. Run and deploy: `server/README.md`.

## Principles
1. **No accounts.** No name, phone number, email, device id or login. The app works fully without the server.
2. **Encrypted on the phone.** Backups and family activity are encrypted with keys that never leave the family's
   phones. The server stores ciphertext under ids derived from those keys.
3. **Keep nothing that isn't needed.** Strip photos are read in memory and dropped. Activity events expire after
   30 days, unused backups after 400 days, rate-limit counters after 2 days.
4. **No identifying logs.** One log line per request: route shape, status, time. No bodies, ids, tokens or IP
   addresses; API Gateway access logs are off.
5. **The phone never depends on it at dose time.** Scanning, reminders and logging stay offline (spec 15).
6. **Opt-in per feature,** asked in plain words (spec 14), changeable in Settings → Helper tools.

## What the server can and cannot see

| Feature | Server sees | Server never sees |
|---|---|---|
| Install token | A random token (only to count requests) | Who or which phone it is; it's never stored, only a hash inside rate counters that expire in 2 days |
| Strip read | Two strip photos (metadata removed again on the server), for a few seconds | Who sent them; the photos are not stored |
| Catalogue | Brand, strength, maker, pocket grid… of a product, and a count of confirmations | Which household confirmed it; expiry and batch |
| Backup | Ciphertext, its size, version, month saved | The key, the contents, whose it is |
| Family circle | Ciphertext events, their size and arrival time | The key, members' names, medicines, which family |
| Training photo | The photo (cleaned), a typed medicine name, month, app version, platform | Member, schedule, text read from the photo, exact time |

The network address of a phone reaches AWS as part of any internet connection; TakeSure does not log or store it.

## Keys (on the phone)
Two random 32-byte keys, made on the phone and kept in the phone's secure storage:

* **Backup key** — one per phone (or per household, if a helper restores it onto a second phone).
* **Circle key** — one per family circle, shared by QR code or a `medsync://join#…` link (the part after `#` is
  never sent to any server, even if the link is opened in a browser).

From a key the phone derives, with HKDF-SHA256 (salt `takesure`):

| Info string | Length | Use |
|---|---|---|
| `vault-id` / `circle-id` | 24 bytes → 32 base64url chars | Where it's stored (`/v1/vault/{id}`, `/v1/circle/{id}`) |
| `vault-token` / `circle-token` | 32 bytes → 43 chars | Sent as `X-Vault-Token` / `X-Circle-Token`; the server keeps only its SHA-256 |
| `vault-enc` / `circle-enc` | 32 bytes | AES-256-GCM key; sealed format `0x01 · nonce(12) · ciphertext · tag(16)` |

Reference implementation: `server/tests/phone.ts` (Node crypto). The app will use `@noble/hashes` and
`@noble/ciphers` (pure JS — React Native has no AES) and `expo-secure-store` for the keys.

**The honest cost of anonymity:** if every phone holding the backup key is lost and the recovery code wasn't kept,
the backup can't be opened — not even by TakeSure. The app shows the recovery code (and a QR) once when cloud backup
is switched on and asks to keep it (WhatsApp to yourself, Drive, or printed). The file backup of spec 01 stays.

## Features

### 1. Strip reading and catalogue (spec 15)
Order on the phone when a medicine is added:
1. The phone reads the strip itself (as today). If it found a brand and strength, it asks
   `GET /v1/catalogue?brand=&strength=` — **no photo is sent**. A profile confirmed by at least 3 households comes
   back as a draft to check.
2. Otherwise, with consent: `POST /v1/strip/read` with the printed side and the pocket side. The server removes
   photo metadata, asks the model (forced structured answer), checks every field (`server/src/profile.ts`) and
   returns a draft profile plus the fields it wasn't sure of.
3. The helper checks and saves. With consent the confirmed profile, without expiry or photos, is added with
   `POST /v1/catalogue`.

Limits: 3 reads a minute and 30 a day per install; a global daily cap (`ModelCallsPerDay`, default 500) protects
the budget. Over the cap, or if the model fails, the answer is 503/502 and the app builds the profile on the phone.

### 2. Cloud backup (encrypted)
`PUT /v1/vault/{id}` with the sealed backup file of spec 01 (photos still left out, ≤2 MB). The server keeps the
latest and the one before, so one bad save can be undone (`GET …?version=previous`). `If-Match` stops two phones
overwriting each other. Settings → Backup: *Also keep a copy online* (off), *Restore from online copy*,
*Delete online copy*. The 30-day backup reminder counts an online save.

### 3. Family circle (activity sharing)
A circle is a group of phones that see each other's medicine activity — the anonymous counterpart of a WhatsApp
group. Each phone posts sealed events; the others fetch everything after their last cursor when the app opens and
in background refresh.

Event (inside the ciphertext only): `{ v: 1, kind: 'taken' | 'missed' | 'skipped' | 'lowStock' | 'refilled' |
'scheduleChanged', member, med, dose, at }`. Members choose what is shared (default: taken and missed only).
*Leave circle* forgets the key on that phone; *Reset circle* makes a new key (old link stops working) and deletes the
old circle from the server.

Sharing to WhatsApp groups stays as it is planned (share sheet); the circle is for families who want it automatic.

Not in this version: push notifications. Pushes need a device push token on the server, which identifies a phone;
that is a separate decision.

### 4. Training photos (spec 07)
`POST /v1/photos` with exactly the spec 07 record. The server cleans the JPEG again and files it under
`training/<month>/`. Photos are deleted after 2 years. This replaces email sending once the app switches over.

## Why DynamoDB (not Postgres)
All access is by key (a vault id, a circle id, a catalogue key, a rate counter); there are no joins or reports.
DynamoDB on-demand costs nothing when idle, deletes expired items itself (TTL), and needs no network setup.
Postgres on AWS (RDS/Aurora) would need a VPC, and a Lambda in a VPC needs a NAT gateway to reach the model API —
a fixed monthly cost before the first user. Large items (backups, photos) go to S3 in both designs.

## Running cost (rough)
Lambda, API Gateway, DynamoDB and S3 stay within or near the AWS free tier for thousands of households. The model is
the main cost: one call per new strip (often zero, once the catalogue has it), capped per day. Check the provider's
current price per image call when choosing the cap.

## Abuse
Install tokens are free to get, so: per-install limits, global caps (installs per day, model calls per day), API
Gateway throttling, size limits on every body, and the catalogue only shares a variant after 3 confirmations — and
always as a draft a person checks. Later, Apple App Attest / Google Play Integrity can prove a request comes from the
real app without identifying the person.

## Build order
1. **Server** (done in `server/`): all endpoints, tests, AWS template. Not deployed.
2. **Deploy** (needs the AWS account and a model key, see `server/README.md`); set `EXPO_PUBLIC_API_URL`.
3. **App: strip enrollment** (spec 15 step 3) using the catalogue first, then strip read.
4. **App: cloud backup** — keys, recovery code, Settings → Backup.
5. **App: family circle** — join by QR / link, events, a simple "Family" view on Today.
6. **App: training photos** switch from email to `/v1/photos`.
Before 3–6 ship: PRIVACY.md (both platforms), the About & safety page (spec 03), store data-safety forms (spec 08).

## Tests (`server/tests/`, `npm test` in `server/`)
* Install tokens: forged and missing tokens are refused.
* Strip read: EXIF/GPS removed before the model sees the photo; unsure fields dropped; junk tokens refused;
  non-JPEG and 3 photos refused; per-install and global limits; model failure → 502.
* Catalogue: nothing offered before 3 confirmations; expiry never stored.
* Vault: round trip of ciphertext, nothing readable on the server, wrong token → 403, previous version, `If-Match`
  conflict, delete removes everything, only two versions kept.
* Circle: two phones share events, cursor paging, wrong key → 403, events gone after 30 days, delete; plain text
  and oversized events refused.
* Training photo: cleaned, filed by month, extra fields (member, text read, time) dropped.
* No stored item contains an install token or a vault token.
