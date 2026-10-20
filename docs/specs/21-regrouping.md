# Spec 21 — One obvious place for everything (regrouping the app)

## Why
Every feature earns its place, but they have grown where they were first needed. Sharing a person sits at the bottom
of their page and in Settings; privacy and agreements are spread over the first-run notice, About, the scan
disclosure, backup and training photos; stock and buying are hidden pages; Settings has three sub-tabs that mix help,
data, people and scanner internals. For older people and busy caregivers, each thing should have one home that can
be guessed.

## Principles (after Jony Ive / Apple)
1. **One home per thing.** A feature lives in one place; other screens link to it, they don't copy it.
2. **Group by the person's job, not by how it was built.** Take · Check · Keep the list · Look after the family.
3. **The most frequent thing is the biggest.** Taking today's dose dominates; setup and internals recede.
4. **Quiet until needed.** Advanced and helper things sit behind one "More" or a page, never in the main path.
5. **Same words everywhere.** Person, medicine, dose, supplies, scan, share. (Not "family member / member / Me"
   in different places, not "schedule / list / medicines" for the same thing.)
6. **Honest controls.** Nothing that looks tappable isn't (the old ✗ on "No match"); every result can be closed.
7. **Privacy is visible where data could leave**, with the same words and one page that explains all of it.

## Screen by screen today → recommendation

| Screen | Today | Recommend |
|---|---|---|
| **Today** | Now card, Later today, Earlier today, Only when needed, low-stock line, day arrows, person picker | Keep. Order: Now → Only when needed → Later → Earlier (collapsed). One "needs attention" line at the top, one at a time: running low → time to buy → backup overdue → reminders off. |
| **Scan** | Camera, result cards (match, check, other brand, other strength, not a match), helper chips, teach, say again, type the name | Keep. Every result card: title + **Close** (top right), one main button, helper actions inside one "Helper" disclosure, "Say it again" inside the card. |
| **Medicines** | People with their medicines, same-medicine warnings, merge duplicates, refill, add person, send | Becomes **the list and supplies**: a segment **Medicines · Supplies**. Medicines: per person, add, same-medicine warnings, merge. Supplies: stock (today's hidden Stock page), buy list and pharmacies (today's Buy page). Person names link to their page; "Add a person" moves to Family (below). |
| **Settings** (3 sub-tabs) | Everyday: test reminder, help, about, doctor export, family share, backup · Timing: dose window, missed after… · Scanner & photos: scanning switch, check the strips, earlier versions, training photos, scanner details | Becomes one grouped list (no sub-tabs), each row opens a page: **Family · Reminders · Scanning · Your data · Privacy & safety · Help**. |
| Person page | Name, colour, language & voice, where they live, meal times, send | Under **Family**. Order: Name & colour → Their day (where they live + meal times, together: both are about time) → Voice → Share (top-level button, not at the bottom). |
| Medicine page | Name, strength, form, when, stock, notes, other names, warn at, course end, barcodes, learned strips, delete | Three blocks: **When to take it** (first; most edited) · **Supplies** (left, warn at, course end) · **For the scanner** (collapsed: other names, barcodes, learned strips, scan the strip once). Delete last. |
| Add medicine | Scan the medicine, photograph a prescription, type it in, other ways | Four equal choices: Scan the medicine · Photograph a prescription · Type it in · **From another phone** (opens a shared file — today only in Settings). |
| Stock, Buy (hidden) | Opened from a medicine or the low-stock line | Become **Medicines → Supplies**. |
| Earlier versions | Settings → Scanner & photos → Medicine list | **Medicines** (top-right "History"): it is the list's history. |
| Check the strips | Settings → Check the scanner | **Scanning** page (and still offered before a first dose). |
| About & safety | Settings → Help | Split: safety and agreements → **Privacy & safety**; version → **Help**. |

## New Settings, one list

* **Family** — everyone on this phone (open their page), Add a person. **Share with family:** Send someone's
  medicines · Open a file someone sent. (Later: family circle, spec 16.)
* **Reminders** — Send a test reminder, phone tips (Focus, Alarms & reminders), and the timing values that are today
  a separate tab (dose window, missed after, follow-up, snooze, before/after a meal), under "Fine-tune".
* **Scanning** — Scanning at dose time (with its disclosure), Check the strips, read by itself, region detector,
  scanner details (helpers).
* **Your data** — Backup (save, restore, undo), Share medicine history (for the doctor), Export the change log.
  Sideloaded builds: Photos for improving the scanner.
* **Privacy & safety** — one page, below.
* **Help** — Report a problem, version and build.

## Privacy & safety — one page, the same words everywhere
1. **The safety notice** (what TakeSure is and isn't) — the text agreed at first run.
2. **Where your data is:** "Everything stays on this phone." Then each way it can leave, only when the person
   chooses, each a row with what is sent and to whom: a backup file · sending a person's medicines · a problem report
   (email) · training photos (sideloaded builds) · the TakeSure server (when it exists; spec 16).
3. **What you've agreed to:** Terms of use (date) · Scanning at dose time (date, version) · Training photos (date),
   each with its full text and a way to withdraw (turn scanning off, stop photos).
4. **Medicine lists:** the built-in lists and their dates (the FDA list's date).
5. **Full terms · Privacy policy** links. **Delete everything on this phone** (with a backup offered first).

Everywhere data could leave (Save a backup, Send someone's medicines, Report a problem, Send photos) shows the same
one-line note with a lock — "Contains health information. It goes only where you send it." — linking to this page.

## Navigation after the change
```
Today        Scan        Medicines                 Settings
                         ├ Medicines (per person)  ├ Family ─ person pages · Share with family
                         ├ Supplies (stock · buy   ├ Reminders
                         │   list · pharmacies)    ├ Scanning
                         └ History                 ├ Your data
                                                   ├ Privacy & safety
                                                   └ Help
```

## Built (20 Oct 2026)
All five steps below. Notes: "Say it again" stays under the result card; helper actions were already folded
("Helper: it is the right medicine", teach chips). Routes: `/family`, `/reminders`, `/scanning`, `/data`, `/privacy`,
`/help`; `/about` → `/privacy`, `/inventory` → Medicines → Supplies, `settings?tab=helper|timing` → Scanning / Reminders.

## Build order (each step ships on its own)
1. Settings as one grouped list with the six pages; move Timing under Reminders → Fine-tune; About split.
2. Privacy & safety page, the "What you've agreed to" record, and the shared lock note.
3. Medicines → Supplies segment (Stock + Buy), History button; Add medicine → "From another phone".
4. Family page (people + sharing); person page and medicine page reordered.
5. Today's single "needs attention" line; Scan cards made consistent (Close, Helper disclosure).

Nothing is removed; every feature keeps working. Old deep links (`/inventory`, `/buy`, `/history`, `/about`,
`settings?tab=…`) keep opening the new homes.
