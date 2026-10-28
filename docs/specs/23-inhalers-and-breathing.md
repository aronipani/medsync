# Spec 23 — Inhalers and breathing

## Problem
Many people on a family's list use an inhaler. TakeSure already handles one: the unit is "puff", a daily inhaler gets
reminders like a tablet, and an SOS inhaler can be set to "Only when needed" and recorded on Today. Stock already counts
down by puffs.

But nothing says which inhaler is which. The reliever's button says "Took a dose", and nobody can see how often the
reliever was needed, which is the first thing a doctor asks. Sar built a separate asthma app ("My o2", Feb–Mar 2026,
`realsarthutrap1/indiaasthmaapp`). It has a daily breathing log, India-specific triggers and a weekly summary. This
spec brings the parts that fit TakeSure into it and leaves the rest out (see "What it doesn't do").

## Decision (proposed, for Aroni to decide)
For **v1.1 or later**, not the first App Store submission. There are three changes. Everything stays on the phone, with
no new permission, no account and no server:
1. **Medicine editor:** "What is this inhaler for?" with two answers, **Preventer · every day** and **Reliever · when breathless**.
2. **Today:** the reliever records its puffs in one tap and shows the puffs left. There is an optional **Breathing today** check-in.
3. **Person → Breathing:** the last 4 weeks of reliever puffs, preventer doses and check-ins, with **Send to the doctor**.

Mockups (three phone screens): https://claude.ai/artifact/NVkw2zKudPxtDPv3eTQYCi (private until shared).

## 1. Medicine editor (`app/med/[id].tsx`)
* For an inhaler (unit `puff`), the existing "When to take it" chips (*At set times* / *Only when needed*) are replaced
  by one question, **What is this inhaler for?**, with the line "The doctor or the box usually says. It decides whether
  TakeSure reminds you."
  * **Preventer · every day:** "Taken at set times, even when breathing is fine. TakeSure reminds you." This is the
    same as *At set times*, with doses edited as now.
  * **Reliever · when breathless:** "Taken only when needed. No reminders. Record each time on Today." This is the same
    as *Only when needed* (`asNeeded`).
* **Puffs each time** is the existing quantity (`asNeeded.qty` or the dose `qty`).
* For puffs, the stock count is labelled **Puffs left on the counter**, with the line "Look at the number on the
  inhaler. TakeSure counts down from it." The low-stock warning and buy list are unchanged (spec 17).
* From a prescription or a box (`rx.ts`, `label.ts`), SOS/PRN or a reliever-only ingredient (salbutamol, levosalbutamol,
  albuterol) suggests *Reliever*, and anything else suggests *Preventer*. As with every prescription read, it is a draft
  the person confirms (spec 09).
* Other forms (tablet, syrup…) keep the chips as they are.

## 2. Today (`app/(tabs)/index.tsx`, `src/components/AsNeeded.tsx`, new `src/components/BreathingCard.tsx`)
**Reliever row** (in *Only when needed*)
* Line: "Reliever · 4 puffs today, at 7:10 AM and 3:45 PM". When the stock is known, a second line says "136 puffs left".
* One button, **Took 2 puffs now**, using the medicine's own puffs each time. Tapping the row still opens the existing
  sheet with "Remove the 3:45 PM one". Other as-needed medicines keep "Took a dose".

**Breathing today** card
* Shown only for people who have an active inhaler (preventer or reliever). With *Everyone* selected, there is one card
  per such person, named.
* "How was Ma's breathing today?" has three big answers: **Fine** · **Some trouble** · **Bad**.
* "Anything set it off? (you can skip this)" offers optional chips. Seven are shown and the rest sit under *More options*:
  Dust · Smoke · Incense · Cold air · Cooking fumes · Cold or cough · Walking, stairs | Traffic or building dust ·
  Fireworks · Weather change · Pollen · Something else. The list is adapted from My o2's India list
  (`app/src/data/triggerOptions.ts`).
* Once saved, the card folds to one line ("Breathing today: Some trouble · dust") that opens it again to change it.
* The day arrows reach past days, so a missed answer can be filled in later ("How was it on Monday?").
* **No notification.** The check-in never rings, so there are no extra reminders (the iOS limit is 64) and no nagging.
* It can be switched off for a person: Settings → Family → person → **Ask about breathing each day**.

## 3. Person → Breathing (new `app/(tabs)/breathing.tsx`, `href: null`, like `member/[id]`)
* It opens from a **Breathing** row on the person page. The row appears only when that person has an inhaler.
* **Reliever:** "This week: 14 puffs on 5 days", with last week underneath and one bar per week for 4 weeks.
* **Preventer:** "Taken 50 of 56 times", plus a 28-day grid built from the existing dose logs. A day shows ✓ when every
  dose was taken, ½ when some were missed and ! when none were taken, using a shape and a word, not colour alone.
* **How breathing was:** days marked Fine, Some trouble, Bad and Not recorded, with the triggers noted most often.
* A fixed sentence: "This only shows what was recorded. It can't tell how well the asthma is controlled. Show it to the
  doctor."
* **Send to the doctor** opens the share sheet with a short plain-text summary and a CSV of the 4 weeks (built on
  `historyExport.ts`). **See every record** opens the existing history.

## Data (`src/types.ts`)
```ts
// Medication
inhaler?: 'preventer' | 'reliever'; // only when unit is 'puff'; reliever ⇔ asNeeded

// AppState
breathing: BreathingDay[];

/** One answer per person per day (a new answer for the same day replaces it). On this phone only. */
export interface BreathingDay {
  id: string;
  memberId: string;
  date: string; // YYYY-MM-DD, the person's own day (spec 19 time zones)
  feel: 'fine' | 'some' | 'bad';
  triggers: string[]; // ids from the list in src/breathing.ts
  at: string; // ISO time recorded
}

// Member
askBreathing?: boolean; // default on when they have an inhaler
```
* Backups (`backup.ts`) treat a missing `breathing` as `[]`, so old backups load. A person file (spec 20) carries that
  person's last 90 days. The history CSV gains the check-ins.
* Reliever puffs and preventer doses are **not** new data. They are the existing `DoseLog`s and stock events.

## Code
* `src/breathing.ts` (pure, tested) holds the trigger list, reliever puffs per week, preventer taken/expected per day,
  check-in counts, top triggers and the doctor summary text. The logic is adapted from My o2's `lib/trackerSynthesis.ts`
  (`sumRescuePuffs`, `summarizeTopTriggerTags`, `buildWeeklyBreathingReport`) and rewritten for TakeSure's `DoseLog`
  and `Medication`. Nothing is copied over: the types are different and TakeSure doesn't use zustand.
* `store.tsx` gains `setBreathing(memberId, date, feel, triggers)`.
* `rx.ts` and `label.ts` gain the reliever/preventer suggestion.
* No new dependency. "Send to the doctor" uses the existing share and CSV.

## What it doesn't do (from My o2, left out)
* **Accounts, Supabase, the Next.js API, DPDP consent flows.** TakeSure v1 has no account and no server.
* **Air quality (WAQI).** It needs the internet and an API key. At the earliest it would go through the TakeSure server
  (spec 16), as its own spec.
* **"Power Blow" breathing game.** It needs the microphone, and the 24 Oct decision keeps TakeSure to camera, photos,
  contacts and motion.
* **Streaks, "Bloom" challenges, the playful tone, Hindi/Hinglish screen text.** These don't fit spec 14. Spoken
  languages already exist.
* **Peak flow, action-plan zones, any "controlled / uncontrolled" verdict or limit on reliever use.** These would be
  medical interpretation, which TakeSure never does (decisions, 17 Oct).

## Words (spec 14 rules)
"Preventer" and "reliever" are the words on Indian inhaler boxes and from doctors, and "when breathless" is plain.
Never "rescue", "attack", "controlled", "risk", "too much" or "should". Counts only, no judgement.

## Open questions for Aroni
1. Is this v1.1, or after?
2. **Combination inhalers used both ways** (budesonide + formoterol, e.g. Foracort as "maintenance and reliever"). The
   proposal is a preventer with set times plus a switch, **Also used when breathless**, which adds it to *Only when
   needed*.
3. Should the check-in be on by default for anyone with an inhaler (proposed), or off until switched on?
4. Is a text summary plus CSV enough for "Send to the doctor" now, with a one-page PDF later (needs `expo-print`)?
5. Store listing: recording breathing, with no interpretation, should keep the "not a medical device" position. Confirm.

## Tests (`tests/breathing.test.ts`)
* Reliever puffs per week across a week boundary and in another time zone. Undo removes the puffs.
* Preventer counts ignore days before a dose's `since`, and count skipped separately from missed.
* One check-in per person per day: a second answer replaces the first. Old backups without `breathing` load.
* Top triggers: ties keep the list's order, and none are shown below 2 days.
* The doctor summary is counts only, so none of the words from "Words" appear.
* The editor suggestion: "Asthalin inhaler SOS" gives reliever, "Foracort 200 1-0-1" gives preventer.

## Build order
1. `src/breathing.ts` and its tests.
2. The editor question, plus the prescription and box suggestion.
3. The reliever row and button on Today.
4. The check-in card, store, backup and person file.
5. The Breathing page and Send to the doctor.

## Checklist (spec 14)
- [x] One obvious tap for the main thing: **Took 2 puffs now**, and one of three answers.
- [x] Nothing only a helper needs on screen. Triggers are optional, and the extra triggers sit under *More options*.
- [x] Every word is plain: no "rescue", "SABA", "ICS" or "exacerbation".
- [x] Targets are at least 44 pt, answers 56 pt, and text at least 16 pt.
- [x] Works with no settings changed: the check-in appears once an inhaler is added and can be switched off.
