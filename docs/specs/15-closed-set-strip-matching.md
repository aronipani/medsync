# Spec 15 — Recognise the household's own strips (closed-set matching + strip profiles)

## Problem
The scan tries to *read* the name, and reading fails often: glare, small print, worn foil, strips cut down to two
pockets with half a name left. The region detector (spec 10) is still weak (trial recall: brand 0.55, strength 0.04,
expiry 0), and Apple Vision / ML Kit cannot read print that is no longer there.

But a household only has 2–25 strips per person. The scan doesn't need to know *any* medicine in the world — only
**which of this household's strips** it is looking at, or **none of them**. That question can be answered from
fragments ("…LOPIL… 75"), colours, the pocket grid and earlier photos of the same strip, all on the phone and offline.

## Principles
1. **Decide among the household's strips, not read from scratch.** Reading is still done (spec 12); its output is
   evidence, not the answer.
2. **A false green is the harmful error.** Every rule below leans to "not sure, scan the other side" over a guess.
3. **Dose time stays offline.** Scanning never needs the internet. A frontier model is used only once per new strip,
   when someone adds it, through the DoseSure server.
4. **One standard DoseSure server, not one per family.** Families never set up keys, accounts or servers. The app
   talks only to the DoseSure backend; the backend talks to the model provider.
5. **Simple for older people (spec 14).** The patient sees green / amber / red as today. Profiles, scores and
   enrollment detail are for helpers.

## 1. The strip profile (stored on the phone, per medicine)

Each `Medication` gets an optional `profile`, built when the strip is added and kept up to date by confirmed scans:

```ts
interface StripProfile {
  version: 1;
  source: 'server' | 'phone';        // read by the DoseSure server, or built on the phone only (offline / no consent)
  brand: string;                     // "Clopilet"
  generic?: string;                  // "Clopidogrel"
  strength: string;                  // "75 mg"
  maker?: string;                    // "Sun Pharma"
  tokens: string[];                  // distinctive words/numbers that survive cuts: ["CLOPILET", "CLOPIDOGREL", "75"]
  repeatsPerPocket: boolean;         // name printed again behind each pocket (common on Indian foil)
  grid?: { rows: number; cols: number };   // pocket layout, e.g. 2 × 5
  colours?: { foil: string; print: string[] };  // hex, rough
  regions?: { cls: 'brand'|'contents'|'strength'|'expiry'; box: [number,number,number,number] }[];  // 0…1 on the back
  lookAlikes?: string[];             // brands easily confused with this one ("Clopitab")
  references: RefImage[];            // up to 6, newest first
}
interface RefImage { file: string; side: 'front'|'back'; embedding: number[]; at: string }  // file: 320 px crop in profiles/
```

Size: about 2 KB of data plus six 320 px crops (~20 KB each) per medicine. Included in backups (spec 01) without the
crops; the crops are rebuilt from the next confirmed scans.

The existing `learned` fingerprints ("Teach this strip", `src/learn.ts`) stay and feed `tokens`.

## 2. Matching at dose time (on the phone)

For one scan, every **active medicine in the household** (all members, not just the person due) gets a score from
these signals:

| Signal | How | Weight (start; tune on traces) |
|---|---|---|
| Text | Fuzzy match of everything read against `tokens`, `name`, `aliases`, `learned`: character trigrams + local alignment, so "LOPIL" matches "CLOPILET". Several copies of the name (`repeatsPerPocket`) vote. | highest |
| Strength | Strength read and equal to the medicine's — or a different strength read (counts *against*) | high |
| Barcode | Exact barcode match | decisive |
| Look | Cosine similarity of the photo's image embedding to `references` (small on-device image model, e.g. MobileNetV3 / DINOv2-small in TFLite, ~5–15 MB) | medium |
| Colours and grid | Foil/print colours and pocket rows × columns close to the profile | low |
| Pockets left | Full pockets counted vs stock expected (Stock tab) | low, tie-break only |

**Due now is not a signal.** It only decides the order when two medicines are tied, and it never turns an
uncertain scan into a green.

### Decision rules
* **Green** only if the best medicine is due for this person **and** has a text or barcode match (look alone is
  never enough) **and** is clearly ahead of the second best (margin, e.g. 1.5×).
* **Look-alike pair** (`lookAlikes`, or two household medicines flagged by the same-medicine warning, spec 02): green
  needs the strength **and** a brand text match.
* **Best match is someone else's medicine** → red: "This is Papa's Clopilet, not yours."
* **Best match is this person's but not due** → red with "scan next" (as today).
* **Text match but the score is close to another medicine, or only look matches** → amber: "Not sure — turn the strip
  over and scan again."
* **Nothing clears the threshold** → red "not recognised" (as today, with the training-photo path of spec 12).

### Keeping the profile current
After a scan the person confirms (marked taken, or "Yes, that's right"), the photo's 320 px crop and embedding replace
the oldest `references` entry, and new readable tokens are added to `learned`. Wear happens slowly, so yesterday's
photo is the best reference for today's. Expiry and batch are kept from the **first** scan of a new strip, because
they are the first lines to be torn off.

## 3. Adding a strip: enrollment through the DoseSure server

### Flow (helper-facing)
1. Add a medicine → **Scan the strip** → photo of the back, then the front (two photos; the app guides with an outline).
2. If online **and** the household allowed it (consent, below): first the brand and strength the phone read itself
   are looked up in the shared catalogue (no photo sent). If no confirmed profile is found, the two photos go to the
   DoseSure server, which asks a frontier vision model to read them and returns a draft profile (section 1) in a few
   seconds.
3. The helper sees **"Is this right?"** with name, strength, maker and the pocket grid, big and editable. Nothing is
   saved until they press **Save**. Never added to the schedule automatically — same rule as prescriptions (spec 09).
4. If offline, consent is off, or the server fails: the profile is built on the phone (text read today + the two
   photos), `source: 'phone'`. The app offers to improve it later ("Read this strip better when online?"), once.

### Server (one standard DoseSure backend — built in `server/`, see spec 16)
* **Endpoint:** `POST /v1/strip/read` — two JPEGs (≤1280 px, location/camera data removed on the phone), app version,
  platform. Returns the profile JSON. No account, no family id, no name of the person.
* **The model key lives only on the server.** The app has none; a leaked app build can't use the provider directly.
* **Abuse and cost:** per-install anonymous token (random, created on first run, can be reset), rate limit (e.g. 30
  reads per day per install, 3 per minute), request size cap. Cost is roughly one model call per new strip — a few per
  household, not per dose.
* **Shared strip catalogue (decision below):** the server can remember profiles by strip design (brand + strength +
  maker + pack), so the second household adding Clopilet 75 gets the answer instantly, with no model call. Only the
  profile data is kept — **never the photos** — and only after a helper confirmed it.
* **Output is checked, not trusted:** the server validates the JSON against the schema, drops fields it can't parse,
  and flags low-confidence fields so the app shows them empty for the helper to fill.
* **Model choice is the server's job.** The app sees a fixed JSON contract; the model or provider can change without
  an app update.
* Same host can later take the opt-in training photo uploads of spec 07 (`SHARE_ENDPOINT`), so one server covers both.

### Privacy and consent
* First enrollment asks once per household: *"Send strip photos to DoseSure to read them? Photos are read and deleted;
  nothing that names you is kept."* **Allow** / **Not now**. Changeable in Settings → Helper tools.
* Photos are cropped to the strip on the phone where the region/strip finder can, so pharmacy stickers with a
  patient's name are less likely to be sent. Text read on the phone is not sent.
* Server keeps photos only in memory for the request; logs keep no image and no text read.
* PRIVACY.md (both platforms) and spec 03's About & safety page must describe this before it ships. Store forms
  (spec 08) must declare health-related photos sent for processing.

## 4. What this means for the region detector (spec 10)
The detector becomes a **cropping helper**: it finds where to read, but the decision comes from matching. Better
training data comes from the same server pipeline, used on the computer: a frontier model drafts boxes for collected
photos, a person corrects them in CVAT, and `autolabel.py` is replaced as the label source. Retrain at 960 px once
there are ~1,500 checked photos.

## 5. Build order
1. **Built (Oct 2026): fuzzy closed-set matching on the phone** (`src/household.ts`, used by the Scan tab after the
   strict matcher in `src/match.ts`): household-wide candidates, trigram + alignment text
   score, margin rule, look-alike rule, "someone else's medicine" result. No server, no new model. Biggest quick win.
2. **Strip profiles** on the phone: `profile` on `Medication`, two-photo enrollment, reference crops refreshed on
   confirmed scans, backup support.
3. **Image embeddings** on the phone (TFLite model in `assets/models/`), added as the "look" signal.
4. **DoseSure server**: built in `server/` with strip read, catalogue and rate limits (spec 16); still to deploy.
   App side: consent screen, enrollment flow, PRIVACY.md.
5. **Detector retraining** with model-drafted, hand-checked labels.

## Decisions needed
* ~~Hosting~~ — AWS Lambda + DynamoDB + S3 (spec 16).
* **Shared strip catalogue:** built (shared after 3 confirmations, no photos, no expiry); switch on or off at launch.
* **Model provider** (Claude by default, changeable on the server) and a monthly budget cap (the server stops calling the model and the app falls back to
  `source: 'phone'` when it's reached).

## Tests
Built (`tests/household.test.ts`):
* Half names from a cut strip ("…LOPIL… 75", "CLOPI" + "ILET" from two pockets) pick Clopilet 75 among a
  10-medicine household; common strip print and random text pick none.
* A different strength printed rules a medicine out.
* Fragment + strength with nothing similar in the house: sure (green); fragment without strength: amber.
* Look-alikes in the house (Clopilet / Clopitab, Rosuvas / Rosuday): a fragment match is never green; two equally
  good fits: "not sure, scan the other side".
* Another member's strip is identified (the Scan tab then says whose it is); due-now is not an input.
* Taught-strip words count as name words.

To build with profiles and enrollment (`tests/profile.test.ts`):
* Look-only match gives amber, never green.
* Reference images: the 7th confirmed scan replaces the oldest; expiry from the first scan is kept.
* Server profile with a bad or missing field: the field is left empty for the helper, the rest is used
  (server side already tested in `server/tests/profile.test.ts`).
