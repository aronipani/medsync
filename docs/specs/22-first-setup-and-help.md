# Spec 22 — First setup by doing, first-time tips and "How to use TakeSure"

## Problem
A new user today gets the safety notice, then Today's "Let's add the medicines" with three buttons. Nothing shows
what a reminder looks like, what *Scan now* does, or what green, amber and red mean — the person first meets the scan
result at dose time, with the medicine in hand. Older people won't read a tour, and a caregiver setting the phone up
for a parent needs to know what the parent will see.

## Decision
**Learn by doing, not by reading.** No swipe-through tour, no video, no coach marks over the whole screen. Instead:

1. **Guided first setup** — three short steps that do the real setup and end with one practice scan.
2. **First-time tips** — one line, the first time a person meets a screen or result that matters.
3. **How to use TakeSure** — a short page in Settings → Help that replays the same steps and the three colours.

The guided setup is the main piece; 2 and 3 cover people who skipped it or get the phone handed to them.

## 1. Guided first setup
Starts right after **I understand** on the first-run notice (spec 03), only when there are no medicines. Full
screen, one job per step, `Steps` progress line ("Step 1 of 3"), **Skip for now** small at the bottom of every step.
Skipping lands on Today as now; Today offers **"Finish setting up"** (one line, Today's "needs attention" slot, spec 21)
until step 3 is done or dismissed.

**Step 0 — Who is it for?** (not counted in the steps)
"Who will take the medicines?" — two big choices:
* **Me** → the person is named (one field: "Your name"), wording below says *you*.
* **Someone in my family** → "Their name"; wording says *they* / the name. Also offers **"+ Another person"** once.
* Quiet link: **"I have a file from another phone"** → opens person import (spec 20) and skips to step 3.

Replaces the "Me" starter placeholder for new installs (`starterPerson` stays for old installs).
Saved as `settings.setupFor = 'self' | 'other'`; it only changes words, never features.

**Step 1 of 3 — Their day.** "When does {name} usually eat?" Breakfast, lunch, dinner, prefilled with the
defaults, one tap each to change. Where they live only if *Someone in my family* ("Does {name} live in another
time zone?" → folded, spec 19). One button: **Next**.

**Step 2 of 3 — Add one medicine.** The existing add flow (spec 14: *Scan the medicine* big; prescription and typing
under "Other ways to add"), started from the wizard and returning to it on save. Header line:
"Start with one. You can add the rest after." After saving: "✓ Clopilet 75 added — 8:30 AM after breakfast".
Choices: **Next: try it** (main) · **Add another medicine** (secondary, loops back here).

**Step 3 of 3 — Try a scan.** "This is what happens at medicine time." Three parts, each one screen:
1. **The reminder** — a mock notification card drawn in the app (not a real notification), with the real wording:
   "💊 8:30 AM — Clopilet 75 · Scan now · Remind me later". Under it one line: "Tap *Scan now* when it comes."
   Button **Allow reminders** asks the notification permission here, with the reason, instead of at a random moment.
   If refused: "Reminders are off — you can turn them on in Settings → Reminders" and carry on.
2. **The practice scan** — "Hold the Clopilet 75 strip up to the camera." Camera permission asked here, with the
   reason. Uses Check the strips (spec 11): checked against every medicine, **nothing is logged, stock doesn't
   change**, and the result records a test for that medicine (so the "test-scan first" reminder is already satisfied).
   The result card is the real one, spoken in the person's language, with a band at the top: **"Practice — nothing
   is recorded"**. Main button **Done** (not "I took it").
   * Not recognised → the normal Check-the-strips path ("Which medicine is it?"), then: "That happens with worn or
     shiny strips. At medicine time, try the other side or tap *Type the name*." Still counts as step done.
   * No strip at hand / typed or prescription-only medicine → **"I'll try later"** finishes setup; Today's
     *Check the strips for 8:30 AM* already covers it.
   * US dose-scan off (spec 19): the practice scan still runs (it is a check, not a dose decision); the closing
     line says "Scanning at medicine time is off. You can turn it on in Settings → Scanning."
3. **The three colours** — one screen, three big rows, each with its symbol and word, never colour alone:
   * ✓ green **Matches your list** — take the amount shown.
   * ⚠ amber **Check the name** — read the strip yourself, or scan the other side.
   * ✋ red **Stop** — this isn't the medicine due now.
   Each row has a 🔊 to hear it. Button: **Start using TakeSure**.

**Hand-over (only `setupFor = 'other'`)** — last screen: "Ready for {name}. Give them the phone, or keep it and
send their list to their phone (Settings → Family → Share)." Buttons: **Hand over now** (switches Today to that
person, and every screen stays on them) · **Add more medicines first**.

Setup state: `settings.setup = { step: 0|1|2|3, done?: string, dismissed?: string }`. Kept in backups (so a restored
phone doesn't start the wizard). The wizard never shows again once `done` or `dismissed`; Help replays it without
changing data.

## 2. First-time tips
One line, at most **one tip on screen at a time**, never on top of a result's main button. Plain card with a ✕ and
"Got it". Shown once per phone (`medsync.tips.v1` in AsyncStorage, not in backups — it describes this phone's user).
Skipped entirely for a tip whose lesson the guided setup already showed (e.g. colours after step 3).

| When | Tip |
|---|---|
| First amber result at dose time | "Amber means *check*, not wrong. Read the name on the strip, or scan the other side." |
| First red result at dose time | "Red means this isn't due now. Put it aside and scan the next strip." |
| First reminder opened with *Scan now* | "Scan each strip due now. The list ticks them off." (on the Now card) |
| First missed dose shown on Today | "Missed doses are recorded by themselves. Tap one if it was taken." |
| First low-stock line | "Tap here to refill or see where to buy." |
| First open of Medicines → Supplies | "The count goes down with each dose. Fix it if it's wrong." |
| Second medicine added for one person, sharing an ingredient | none — the same-medicine warning (spec 02) already explains itself |

Tips are spoken only if the person taps 🔊 (results already speak; a second voice would talk over them).
No tips on Settings pages, the camera while reading, or helper screens.

## 3. "How to use TakeSure" (Settings → Help)
Top row of Help. A short page, each part a card that opens on tap:
1. **Setting up** — "Run the first setup again" replays steps 0–3 *without* changing anything already saved
   (existing people and medicines are shown, step 2 can be skipped). Useful for a new family member.
2. **At medicine time** — the mock reminder and *Scan now*.
3. **Green, amber, red** — the three rows from step 3, with 🔊.
4. **When a scan doesn't work** — other side, more light, torch, type the name; "Check the strips" link.
5. **Running low and buying** — Supplies, buy list, pharmacies (spec 17).
6. **Keeping a backup** — what it saves, where to keep it (spec 01).
7. **Reset tips** — shows the first-time tips again.

Every card readable aloud (🔊) in the person's language, with the English fallback (spec 06).
No external links, no video, works offline.

## What it doesn't do
* No feature tour of every tab, no carousel, no animated hand pointers, no full-screen overlays.
* Never blocks: every step can be skipped and finished later; the app works without it.
* Never logs a dose, moves stock or teaches a strip from the practice scan.
* No new medical wording: green says "Matches your list" as on the real card (never "correct"; store guideline
  1.4.1), and the colours keep the safety-notice v2 meaning.

## Words (spec 14 rules)
"medicine time", not "dose event"; "practice", not "test mode"; "reminder", not "notification" (except in the
system permission reason). Every sentence one line on a 375 pt-wide phone at default text size.

## Code
* `app/setup/_layout.tsx` + `app/setup/[step].tsx` — the wizard (full screen, like other one-job screens).
* `src/setup.ts` (pure): `nextSetupStep(state)`, `setupNeeded(state)`, `wordsFor(setupFor, name)`.
* `src/tips.ts` (pure): tip ids, `tipToShow(context, seen)`; `src/tipsStore.ts` for AsyncStorage.
* `src/components/Tip.tsx`; `src/components/MockReminder.tsx`; `src/components/ColourKey.tsx` (shared by step 3
  and Help).
* `app/(tabs)/help.tsx` — new "How to use TakeSure" section; `app/(tabs)/howto.tsx` hidden tab page.
* `FirstRunNotice.tsx` → routes to `/setup/0` when `setupNeeded`.
* Test scan screen gains a `practice` param: band, *Done* button, closing line.

## Tests
`tests/setup.test.ts`: wizard shown only with no medicines and not done/dismissed; restored backup with medicines
skips it; skip at each step lands on Today with "Finish setting up"; person import jumps to step 3; replay changes
nothing; `setupFor` only changes words. `tests/tips.test.ts`: each tip once; never two at once; tips already taught
by the setup are skipped; reset shows them again. Practice scan: no log, no stock event, records a test result.

## Build order
1. `ColourKey` + Help → "How to use TakeSure" (cheapest, useful at once, reused later).
2. Guided setup steps 0–2 with skip and "Finish setting up".
3. Step 3: mock reminder with permission ask, practice scan, colours; hand-over screen.
4. First-time tips.

## Checklist (spec 14)
- [ ] Each step: one obvious main button?
- [ ] Could a 75-year-old finish setup alone? Could a caregiver finish it in under 3 minutes?
- [ ] Every step skippable, and the app fully usable after skipping?
- [ ] Practice scan logs nothing and moves no stock?
- [ ] Every colour shown with a symbol and a word?
