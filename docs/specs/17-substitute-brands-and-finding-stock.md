# Spec 17 — Substitute brands, and finding the medicine when it runs out

## Problem
Two things happen at nearly every refill in India:

1. **The pharmacy gives a different brand.** Clopilet 75 is out, so the pharmacist hands over Clopitab 75 or
   Deplatt 75 — the same clopidogrel 75 mg. Today the scan shows **red** ("this looks like X, not Y") although it is
   the right medicine. People either stop trusting red or stop scanning. Worse, the opposite case looks the same to
   a tired eye: a *similar* box that is not the same (the SR version, a 150 instead of a 75, clopidogrel + aspirin).
2. **Nobody has it.** The family runs from pharmacy to pharmacy, or phones round, often for the same one or two
   hard-to-get medicines every month, and often because the refill was noticed with one day of tablets left.

## Goal
* A strip of **exactly the same medicine** (same ingredients, same strength, same form) from another brand is
  recognised as the person's medicine after one confirmation, and never silently.
* A **similar but different** strip is never accepted as a substitute, and the difference is said in plain words.
* Running out is noticed early enough to look, the app knows which pharmacies to ask and in what words, remembers who
  had it last time, and can hand the errand to someone in the family circle.
* Works offline and without the server. No accounts, no location sent anywhere (spec 16 principles).

---

## Part A — Substitute brands

### What counts as "the same medicine"
Two products are **exchangeable** only when all of these are equal:

| Must match | From | Example of a mismatch |
|---|---|---|
| Ingredients (all of them, any order) | `contentsOf` (spec 02), medicine list (spec 04) | Clopilet 75 vs Clopitab A 75 (+ aspirin) |
| Strength of each ingredient | strip text, medicine list | Clopilet 75 vs Clopilet 150; Telma 40 vs Telma 80 |
| Release form | new `form` field (below) | Isoket 10 vs Isoket SR 20; Met XL (extended-release) vs Metolar (plain) |
| Salt, where the list records it | medicine list | metoprolol tartrate vs succinate |
| Unit | `Medication.unit` | tablet vs capsule vs syrup |

If any of these is **unknown**, the products are *not* treated as exchangeable — the app asks (amber), it does not
assume.

`DrugEntry` gains `form?: 'SR' | 'ER' | 'CR' | 'MR' | 'DR' | 'ODT'` (absent = plain) and `salt?: string`.
Brand-name words set the form (`SR`; `XL`, `XR`, `ER`, `PR`, `OD`, `LA`, `Retard` → ER; `CR`; `MR`; `ODT`, `MD`).
On the rest of the strip only unmistakable marks count (`SR`, `XL`, `XR`, `CR`, `MR`, "sustained release",
"extended release" …), because short words like "OD" and "Dr." (Dr. Reddy's) appear in other text. Delayed release
comes only from the list. Two products with different forms are never exchangeable. When the list sells the same
contents as more than one salt (metoprolol tartrate / succinate), the salt must be known on both sides.

**Built (Oct 2026):** `src/substitute.ts` — `exchangeable(usual, strip)` with reasons and unknowns,
`differenceMessage`, `substituteCard`; tests in `tests/substitute.test.ts`. The hand-checked list now splits
metoprolol into Metolar (tartrate, plain) and Met XL / Revelol / Starpress XL (succinate, ER) — before, they were one
entry, so the same-medicine warning and household matching treated them as one medicine. Also added: Cordarone X,
Isoket, Clopitab A / Clopilet A / Deplatt A (clopidogrel + aspirin).

### Medicines that are never swapped without the doctor
Some medicines behave differently enough between makers that even a true same-salt swap should be checked. They are
listed by ingredient (`ASK_BEFORE_SWAP` in `src/substitute.ts`), so brands from the large list are covered too:

amiodarone (Cordarone X), warfarin and acenocoumarol, levothyroxine (Thyronorm, Eltroxin), phenytoin,
carbamazepine, valproate, lamotrigine, lithium, digoxin, tacrolimus, cyclosporine, theophylline.

For these the app still recognises the other brand (so the scan isn't red for the right drug), but shows amber
**"Same medicine, different maker. For this medicine, ask your doctor before changing brands."** and the
substitute is saved only with *Doctor said it's fine*. The refill message (Part B) asks for the usual brand first.

### At the scan
After the strict matcher and household matching (spec 15) fail to find a due medicine by name:

1. Read the strip's contents and strength (strip text first, then medicine list by brand).
2. If they are **exchangeable** with a medicine due now for this person → **amber, not green**:
   > **Different brand of Papa's Clopilet 75?**
   > This strip: **Clopitab 75** — clopidogrel 75 mg
   > Usual: **Clopilet 75** — clopidogrel 75 mg
   > [ **Yes, the pharmacy gave this** ]  [ No ]
3. **Yes** → the brand is added to that medicine as an *other brand* (below); this dose is logged taken; the
   result turns green and is spoken as usual. From now on this brand goes green directly.
4. If they are **similar but not exchangeable** → red, with the difference named, not "wrong medicine":
   * "This is clopidogrel **150**. Papa takes **75**."
   * "This is the **slow-release (SR)** kind. Papa's is the plain kind."
   * "This also contains **aspirin**. Papa's Clopilet has only clopidogrel."
   * "Ask the pharmacist or doctor before taking it."
5. Never green on the first sight of a new brand. Never added without a person tapping Yes.

The same check runs on **Scan to add** and on **refill** (Stock tab → *Add a refill* → scan): a new brand of an
existing medicine is offered as *Add as another brand of Clopilet 75* instead of a second medicine — which also stops
the duplicate that spec 02 would otherwise have to warn about.

### Stored data — the existing "Other names on the strip"
The medicine page already has **Other names on the strip** (`Medication.aliases`), and the scanner already accepts
any strip showing one of them. A confirmed other brand is stored there — no new field:
* **Yes, the pharmacy gave this** adds "Clopitab 75" (brand + strength) to the medicine's other names. From then on
  the strict matcher finds it and the scan goes green.
* Household matching (`src/household.ts`) already uses other names, so worn strips of the new brand are recognised.
* Backups (spec 01) already carry them. The same-medicine warning (spec 02) already reads contents from them.
* **Typing an other name by hand gets the same check.** When a name typed there is a brand the list knows and
  `exchangeable` says it is *not* the same medicine (Met XL on Metolar, Clopitab A on Clopilet), saving shows the
  difference message with **Cancel / Save anyway**; for ask-before-swap medicines, the doctor line. A generic name
  ("Paracetamol 650") is fine as today.
* The medicine's **name stays the usual brand**; reminders keep saying "Clopilet 75".
* **Stock stays one number** — a tablet is a tablet. The strip in use sets `expiry` as today.
* Not stored: per-brand strip profiles. Confirmed scans of the new brand refresh the medicine's reference photos
  (spec 15), which is enough for worn-strip matching.

### Already in the scan (fixed Oct 2026)
The scan already accepted *any* other brand of the same ingredients from the built-in list as green ("Different
brand: …"), and the generic name too — ignoring release form and salt. With the list fixed to split metoprolol, a
Metolar schedule would still have gone green for a Met XL strip. Now (`checkedRelated` in `src/match.ts`):
* exactly the same medicine → green, as before;
* a different form or salt → **conflict** (red): "looks like Met XL 25 (extended-release)";
* salt can't be read, or an ask-before-swap medicine from another maker → **check** (amber), a person decides.
**Built (Oct 2026):** the amber **Different brand of …?** card (Scan tab, `kind: 'brand'`): this strip and the usual
medicine side by side with their generic names; **Yes, the pharmacy gave this** adds the brand to other names
(`addOtherName`) and shows the green result; ask-before-swap medicines show the doctor line and *Doctor said it's
fine*. A strip whose salt can't be read shows amber *Check with the pharmacist* with the reason. On the medicine
page, newly typed other names are checked on save (`otherNameProblems`): *Not the same medicine?* with the difference,
or *Check with the doctor*; Cancel / Save anyway.

### Shared catalogue (spec 16)
A confirmed substitution adds nothing new to the catalogue except the new brand's profile (as spec 15). The
server never learns which brands a household swapped between.

---

## Part B — Finding the medicine when it runs out

### B1. Notice early, and earlier for hard-to-find medicines
* The refill reminder moves from "low stock" to **"Time to buy"** based on days left (`lasts about N days`), default
  **7 days** before running out, once, in the morning, with *Find it* and *Already bought*.
* A medicine that was **hard to find** last time (two or more pharmacies asked, or *Ordered, coming on…*) is marked
  `hardToFind` and its reminder comes **14 days** before. The person can change the days on the medicine's page.
* Medicines due on the same week are grouped into one reminder and one list ("3 medicines to buy this week").

### B2. My pharmacies
Settings → Helper tools → **My pharmacies**: a short list the family keeps (most families use 2–4).
```ts
interface Pharmacy { id: string; name: string; phone?: string; whatsapp?: string; note?: string; }
```
Added by typing, picking a phone contact, or from a phone number on a bill photo (later). Nothing is looked up
online; no map, no location.

### B3. The buy list — what to ask for
*Find it* opens the **buy list**: one card per medicine, in big text, written the way a pharmacist searches:

> **Clopidogrel 75 mg tablet** — 30 tablets
> Usually: Clopilet 75 · also fine: Clopitab 75, Deplatt 75
>
> **Amiodarone 200 mg tablet** — 30 tablets
> **Cordarone X 200 only** (ask doctor before another brand)

* Generic name, strength and form first; brands the household already confirmed listed as "also fine".
  Brands only known from the medicine list are **not** offered as "also fine" — the pharmacist chooses, and the
  scan checks it (Part A).
* Quantity = enough for 30 days by default (from the doses), editable.
* `askBeforeSwap` medicines say "only" and why.
* Shows *who it's for* only as the member's first name, and only if the person turns that on (off by default).

### B4. Asking pharmacies
From the buy list:
* **Call** — for each pharmacy, a big button that opens the phone dialler. While the call is on, the buy list stays
  on screen to read out.
* **Send on WhatsApp** — opens WhatsApp (or SMS) with the list as a ready message to the chosen pharmacy:
  > Namaste, do you have these? Clopidogrel 75 mg tablet × 30 (Clopilet / Clopitab / Deplatt is fine). Amiodarone
  > 200 mg tablet × 30 (Cordarone X only). Please tell me price and if you can deliver. — sent from DoseSure
  The person presses Send in WhatsApp; DoseSure never sends messages itself (spec 03). One pharmacy at a time,
  with *Next pharmacy* to send the same message on.
* Language of the message follows the app language (English, Bengali, Hindi …), with the generic names always also
  in English, as printed on strips.
* **Show to pharmacist** — the buy list full screen, highest brightness, for the counter.

### B5. Remembering the answer
After a call or message, one question with big buttons, per medicine:
**Has it** · **Doesn't have it** · **Will order — ready on [date]**

* The pharmacy that last **had it** is shown first next time ("Apollo, Gariahat — had it on 3 Oct").
* *Will order* sets a reminder for the ready date ("Pick up Clopilet from Apollo today").
* The record is kept on the phone, in backups, never sent to the server: `Medication.lastFound?: { pharmacyId,
  at }` and a small per-medicine log of the last 5 answers.
* When the refill is scanned in (Part A), the buy-list card closes and *Already bought* is not asked again.

### B6. Hand it to the family
If the phone is in a family circle (spec 16) and the person shares "low stock" events, the buy list can be sent to
the circle: **Ask family to buy**. Other phones see "Need to buy for Papa: clopidogrel 75 mg × 30" with
**I'll get it** (others then see "Rina is getting it") and **Bought**. New circle event kinds, inside the ciphertext
only: `needBuy`, `buying`, `bought`. The server sees nothing new.

### Built (Oct 2026)
* `src/buylist.ts` (pure, `tests/buylist.test.ts`): `needsBuying` (7 days, 14 when hard to find, `buyLeadDays`
  per medicine; courses ending first are left out), `buyItem` (contents first, 30 days' quantity, confirmed brands
  from other names, "only" for ask-before-swap), `pharmacyMessage`, `pharmacyOrder`, WhatsApp/SMS links,
  `withAnswer`, `pickups`.
* **Buy medicines** page (`app/(tabs)/buy.tsx`), opened from Today ("Time to buy …", replacing "running low"),
  Stock (*Buy list and pharmacies*) and the reminders: the list, **Show to pharmacist**, **Bought — add to stock**,
  *Buy something else too*, **Ask a pharmacy** (Call / WhatsApp or SMS with the list, then *What did they say?*:
  Has it / Doesn't have it / Will order + ready day), **My pharmacies** (name, phone, WhatsApp yes/no).
* Reminders: "🛒 Time to buy …" at 9 am, repeated every 3 days while something is still to buy; "Pick up from …
  today" at 9 am on the ready day (skipped if it was bought meanwhile).
* `AppState.pharmacies`, `Medication.found` (last 8 answers), `Medication.buyLeadDays` — in backups.
* Still to do: the message in the app language (English only for now), a lead-days setting on the medicine page,
  family hand-off (B6, after the family circle's app side).

### Not in scope (for now)
* **Shared "who has it in stock" map.** Crowd reports tie a medicine to a place and time — close to identifying,
  and stale within days. Not without a separate privacy review.
* **Online pharmacy ordering or price comparison.** No public APIs we can rely on, terms vary, and the app should not
  steer people to a seller. A plain "search online" button may come later, opening the phone's browser with the
  generic name only.
* Suggesting a substitute the household hasn't confirmed, or any advice about switching medicines.

---

## Simple for older people (spec 14 checklist)
* Scan: one question, two big buttons; the difference shown side by side, spoken too.
* Buy list: one tap from the reminder; the main action (call / WhatsApp the usual pharmacy) is the biggest button.
* Pharmacy list and family hand-off live in Helper tools; the elder never has to set them up.
* Works with no settings changed: without pharmacies the buy list still shows, with *Show to pharmacist*.

## Build order
1. `form` / `salt` / `askBeforeSwap` in the medicine list and `exchangeable(a, b)` with its reasons (pure, tested).
2. Scan: substitute amber card adding to other names; "similar but different" red messages; the same check when
   other names are typed by hand.
3. Refill / Scan to add: "another brand of …" instead of a new medicine.
4. Buy list + Show to pharmacist; Time to buy reminder; `hardToFind`.
5. My pharmacies, Call / WhatsApp message, answers and `lastFound`.
6. Family circle events (after the circle's app side, spec 16).

## Tests (`tests/substitute.test.ts`, `tests/buylist.test.ts`)
* Clopilet 75 ↔ Clopitab 75 → exchangeable. Clopilet 75 ↔ Clopilet 150 → not, reason "strength".
* Clopilet 75 ↔ Clopitab A 75 → not, reason "also contains aspirin". Isoket ↔ Isoket SR → not, reason "release form".
* Metoprolol tartrate ↔ succinate → not, reason "salt". Unknown contents or form → not exchangeable (ask).
* Cordarone X ↔ another amiodarone 200 → recognised, `askBeforeSwap`, saved only with doctor OK.
* Confirmed other brand (in other names) → green on next scan; worn strip of it matched by household matching.
* Scan: Clopitab for Clopilet → green; Met XL strip for Metolar → red; "Metoprolol 25" alone → amber; Tachyra for
  Cordarone X → amber.
* Typing "Met XL 25" as an other name of Metolar → warning on save; "Plavix 75" on Clopilet → no warning.
* Buy list: generic first, only confirmed brands as "also fine", "only" for askBeforeSwap, 30-day quantity.
* Time to buy: 7 days normally, 14 when hardToFind; grouped weekly; closed by a scanned refill.
* WhatsApp message text per language; generic names stay in English.
