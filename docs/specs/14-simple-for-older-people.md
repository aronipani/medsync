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

## Checklist for new features
- [ ] Can the person do the main thing with one obvious tap?
- [ ] Is anything on screen only useful to a helper or developer? → Helper tools or "More options".
- [ ] Would a 75-year-old understand every word without asking?
- [ ] Is every tap target big enough, and every text at least 14 pt (16+ for anything important)?
- [ ] Does it work with no settings changed?
