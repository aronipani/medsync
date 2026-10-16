# Spec 14 — Simple for older people (whole app)

## Who it's for
Older and geriatric patients — often taking several medicines, with weaker eyesight, less steady hands, and less
patience for screens full of options — and the family member who sets the app up for them. The app has to be easy to
understand at a glance and should never make the person read or decide more than the moment needs.

## Rules for every screen
1. **One job per screen, one main action.** The main action is a big button; everything else is smaller or folded away.
2. **At most about five things to read or choose at once.** Rarely used options go under **"More options"** (`More`
   in `src/ui.tsx`), or into Settings → **Helper tools**.
3. **Plain words, no jargon.** "Strip area finder", not "region detector"; "Check the next strips", not "test scan
   readiness"; minutes written as "Remind again if not taken after … minutes". No model names, file formats or
   technical status on patient screens.
4. **Big and easy to hit.** Buttons at least 50 pt high (62 pt for the main one), chips 44 pt, text fields 52 pt;
   body text 16–18 pt, nothing patient-facing below 14 pt; sentence-case labels (small all-caps labels are hard to
   read). The phone's own text-size setting is honoured (React Native scales text with it).
5. **Sensible defaults; settings are optional.** Every timing has a working value. Settings → Timing says so.
6. **Say what will happen, and allow undo.** Destructive actions confirm first; restore can be undone once.
7. **Technical detail is for helpers, off by default.** How a scan was read appears on results only when a helper
   switches on "Show scanner details on scan results".
8. **Helpers' tools never get in a patient's way.** Photo collection for training appears to a new user only as a quiet
   link under "Add a medicine".

## What changed (Oct 2026)
* **Settings** is three tabs (`SegmentTabs`), opening on Everyday:
  * **Everyday** — Family, Send a test reminder (with one platform-specific line), Backup (status, *Save a backup*;
    *Restore* folded under "Restore from a backup"), About & safety.
  * **Timing** — six numbers in two groups, *Dose times* and *Reminders*, in plain words, with "These already have
    sensible values".
  * **Helper tools** — "For family helpers. Nothing here is needed for taking medicines." Test scan; Photos for
    improving the scanner (count, *Collect strip photos*, *Send photos*; the everyday-scan switch, resend, save as
    file and delete folded under "More options"); Scanner details (reader and strip area finder status; switches folded
    under "Change", including the new *Show scanner details on scan results*). `settings?tab=helper` opens it directly.
  * The build version is one small line at the bottom of every tab.
* **Scan tab, nothing due:** "Nothing due right now" and "Next: Clopilet 75 at 9:00 PM" in large text, and at most one
  suggestion — *Check the next strips now* if any strip for the next 24 hours hasn't been checked, otherwise
  "✓ The next strips are checked". The "N of M medicines tested" count and "(nothing is logged)" are gone.
* **Scan results:** the "Read by … · strip area finder …" line only with *Show scanner details* on.
* **Today, first use:** "No medicines yet", a big *Add a medicine* button, then a quiet "Helping to improve the scanner?
  Collect strip photos" link. The Settings button is larger (28 pt) and labelled for screen readers.
* **Everywhere:** bigger buttons, chips, fields and section labels (`src/ui.tsx`); small text on patient screens raised
  (12→14, 13→15 pt); tab labels 13 pt; "Inventory" tab renamed **Stock**.

## Round 2 — whole app (Oct 2026)
* **Scan, green card:** one big **I took it** button (was a small "Mark taken" next to "Cancel"), "Not now" below.
  The "taught strip" and "different brand" boxes are one box that replaces "Check the name on the strip too". Faint
  see-through text on coloured cards is now solid white, 16 pt.
* **Scan, red card:** the raw "Read: …" text only with *Show scanner details*; a plain tip when nothing was read.
  Teaching a strip / linking a barcode is folded under **"Helper: it is the right medicine"** (44 pt chips).
* **Scan, other:** "Hold the strip in view, then press the button" (was "Barcodes scan automatically · tap below for
  printed names"); typing a name folded under "Can't scan? Type the name instead"; torch button 52 pt; "Say it again"
  only (why a voice is missing is explained on the family member's screen); no "Expo Go"; "Taking another photo
  (1 of 2)" instead of "Shine check 1/2"; wrong-strength card says "This strip says 40 mg. You need Vonzai 20."
* **Today:** a labelled **Settings** button; day arrows replaced by "‹ Day before / Day after ›" at the bottom and
  "Back to today". Tapping a dose offers *Scan the strip / I took it already / Skip this dose…* — skipping and undoing
  both confirm. Status badges 15 pt with a symbol (✓ Taken, ! Missed, ⏰ Due now, Later), not colour alone.
* **Schedule:** meal times moved off the list (they're on the person's screen); a labelled *Edit* button per person;
  a real *+ Add a medicine* button under each person's list; paused medicines say "No reminders" instead of fading;
  "Add a family member" and earlier versions folded under "More options".
* **Stock:** big tabs *How many left / What was taken*; "Fix the count"; refill starts at the last refill amount;
  expiry "Clear" became "New strip" with a confirm; "via barcode" dropped; CSV is "Save history as a file".
* **Add medicine:** one big **Scan the medicine**; typing and prescriptions under "Other ways to add".
* **Medicine editor:** sentence-case chips (Tablet, Liquid (ml), Before/After, Breakfast); weekday chips only after
  "Some days only"; "How many are left / Lasts about N days"; "Remind me about this medicine"; other names, warn level,
  last day of the course (a date picker — no more typing YYYY-MM-DD), barcodes and learned strips under "More options";
  removing a time or a barcode confirms.
* **Elsewhere:** reminder action "Remind me later"; test reminder "Check the strips for 9:00 PM"; spoken
  "Wrong strength on this strip"; all-caps labels in prescription check, history and scan-to-add are sentence case;
  prescription Keep/Stop are two chips, not a switch; colour picks 48 pt with a ✓.

* **Bottom tabs everywhere:** Settings is a fifth tab (Today · Scan · Schedule · Stock · Settings); the Today
  Settings button is gone. A family member's screen, About & safety and earlier versions of the list open *inside*
  the tabs (hidden tab pages with a big "‹ Back"), so the bottom bar never disappears. They start fresh each time they
  open (`src/components/freshOnFocus.tsx`). Focused one-job screens — the camera ones (Scan to add, Test scan, Collect
  strip photos) and the add/edit medicine sheets — stay full screen.

## Colours (Oct 2026)
* **Measured, not guessed:** every text/background pair (light, dark, and each time-of-day theme) is at least 4.5:1
  contrast. Before this, at night (21:00–05:00, which switches to light-on-dark) and in dark mode, scan result cards and
  main buttons put white text on bright pastel green/amber/teal — about 1.5–1.9:1, unreadable.
* **Deep fills for white text:** `brandFill`, `okFill`, `warnFill`, `badFill` in `src/ui.tsx` — the same in every theme;
  the bright dark-mode colours are for text and icons only.
* **Main action on a coloured card is a white button** (`kind="light"`), e.g. *I took it* on green.
* **Ghost buttons look like buttons:** link colour plus a thin outline (white on coloured cards, `onColor`).
* **Meaning is never colour alone:** green ✓ "Correct medicine", amber ⚠ "Check the strength", red ✗/✋ with words,
  badges with symbols. Same three meanings everywhere: green = go, amber = check, red = stop.
* Darker light-mode red (#B91C1C), grey text (#4F5F5B) and afternoon/evening headings.

## Look: "less, but better" (Oct 2026)
Design board: MedSync — Calm Design (claude.ai artifact). Black and white do the work; colour only means something.
* **Palette** (`src/ui.tsx`): paper #F6F6F3, white cards, ink #111111, quiet ink #5C5C57. One main button per screen
  in ink (light in dark mode). Signal orange #B84A0E only for "due now". Go #1E7A46, check #8F5A00, stop #B3261E —
  always with a symbol and a word. Dark/night: charcoal #121212, cards #1E1E1E. Every pair ≥ 4.5:1.
* **No time-of-day tints**: one steady background; the app still goes dark at night (21:00–05:00).
* **No borders or shadows on cards**; rounder corners (20 pt cards, 18 pt buttons); flat headers.
* **Today**: large title, then a **Now** card holding *every* medicine due at that time — each with a round tick
  (green ✓ "Taken 9:04 AM", outline when still to take), "1 of 3 done", and one button ("Scan the strips" →
  "Scan the next strip" → "Scan the last strip"). Then **Later today** grouped by time (several medicines under one
  time), then **Done**. Other days list each time with its medicines.
* **Scan result** fills the screen in its colour: big icon, "Right medicine", "Take 1 tablet" at 46 pt, and when
  several medicines are due together, "9:00 AM · medicine 2 of 3" with a progress bar and "Still to take now: …";
  the button reads "I took it — next strip". The camera stays running underneath, so the next scan starts at once.

* **Adding a medicine by scan is two clear steps** with a progress line (`Steps` in `src/ui.tsx`): *Step 1 of 2 · What it
  is* (Scan to add) and *Step 2 of 2 · When to take it* (the editor). Scan to add: one short instruction ("Hold the
  printed side up to the camera. Any way up is fine."), the shiny-foil tip and "Type it in instead" under "Shiny strip,
  or can't scan?", "Name" with "Or tap the right one:", sentence-case form chips, big "Next: when to take it"; another
  side / start again folded away. In step 2 the medicine read in step 1 is a summary card (name, form, what's inside)
  with "Change name, strength or form" folded; typing a medicine in shows the fields as before.
* **Medicine editor:** each time reads as one line ("8:30 AM · After breakfast"); "Save medicine" / "Save changes" /
  "Matches the prescription — save".

* **Check the strips (was "Test scan"):** one plain sentence, then only *problems* (camera or reminders off, each with a
  fix button); "Next 24 hours · 2 of 4 ready" grouped by time with round marks (✓ ready, ! try again, outline not
  checked yet); one big "Check a strip". The result uses the deep fills (it was unreadable at night), a white icon,
  plain meaning, *Yes / No*, 44 pt medicine chips; the raw text and timings only with *Show scanner details*. Text
  reader / strip area finder and sending photos are under "For helpers".
* **Scan, nothing due:** a calm screen — round ✓ "All done for now" (or "Nothing to take right now"), a card with
  **every** medicine at the next time ("Next · 9:00 PM", or tomorrow's first time), and at most one button, "Check the
  strips for 9:00 PM". No medicines yet: "Add a medicine".

* **Each thing in one right place:** Stock is only "how many left" (soonest to run out first); the dose history tab
  is gone — Today's "‹ Day before" shows each past day. "Share medicine history" (the doctor's spreadsheet) is in
  Settings → Everyday; "Earlier versions of the list" in Settings → Helper tools; adding a person only in Settings →
  Family. Schedule has no "More options" any more. Fixed "8:30 AM · 8:30 AM" (clock-time doses) and "10 mls".

## Checklist for new features
- [ ] Can the person do the main thing with one obvious tap?
- [ ] Is anything on screen only useful to a helper or developer? → Helper tools or "More options".
- [ ] Would a 75-year-old understand every word without asking?
- [ ] Is every tap target big enough, and every text at least 14 pt (16+ for anything important)?
- [ ] Does it work with no settings changed?
