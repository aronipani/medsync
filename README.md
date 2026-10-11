# MedSync — family medicine schedule, scan-to-verify and inventory

Expo (React Native, SDK 57) app for iPhone and Android. All data stays on the phone.

## What it does

**1. Schedule and reminders** (Schedule tab)
- Family members, each with their own medicines and usual breakfast / lunch / dinner times.
- Each medicine has one or more doses: *before / with / after* a meal, or a set clock time, with a quantity (½ tablet allowed) and optional weekdays (e.g. Vitamin D3 on Sundays) and course end date.
- One reminder per clock time, grouped across medicines and people ("Ma: Telma 40 · 1 tablet · after breakfast"), with **Scan now** and **Snooze** buttons.
- A second "Not taken yet" reminder if a dose is still open after 30 min.
- Changing a meal time moves every dose linked to it.

**2. Scan to verify** (Scan tab)
- Shows the doses due now for the selected person (from 60 min before until 2 h after).
- Barcodes / QR / DataMatrix are read automatically. **Read strip name** photographs the strip and reads the printed name with on-device ML Kit.
- **Green "✓ Match"** when the strip is a medicine due now. Several can match at once. **Mark taken** records them.
- **Red "✗ No match"** with the reason — wrong medicine, right name but wrong strength (Dolo 500 vs Dolo 650), already taken, scheduled for later, or another family member's medicine — and **Scan next**.
- An unknown barcode can be linked to a due medicine once; after that it matches instantly.
- Fallback: type the name printed on the strip.

**3. Inventory and log** (Inventory tab, Today tab)
- Every dose is logged as taken / missed / skipped with scheduled time, actual time, quantity and method (barcode, strip name, manual).
- Doses not taken within 2 h are logged **missed** automatically. A missed dose can still be marked "taken (late)" from Today.
- Stock goes down when a dose is taken (and back up on undo). Refill / correct count, low-stock warning, "lasts about N days".
- Export full history as CSV (share to WhatsApp, email, Drive).

**4. Adding medicines** (Schedule → + Add medicine)
- **Scan strip, bottle or box:** reads the brand name, strength, form and generic name from the pack (bigger text is treated as the brand) and saves the barcode. You confirm the details, then set when to take it.
- **Photograph or choose a prescription** (up to 4 pages): reads printed lines like `Tab. Dolo 650 1-0-1 after food x 5 days` and understands 1-0-1 / ½-0-½, OD/BD/TDS/QID/HS/SOS, before/after food (AC/PC, empty stomach), weekly doses and durations.
- **Nothing from a prescription is used until a person checks it.** Each medicine shows the exact text it was read from plus warnings for anything unclear. Each must be marked "Matches ✓" or corrected before "Add to schedule" is allowed.
- All text is read on the phone; nothing is uploaded. Handwritten prescriptions usually can't be read — add those medicines one at a time.

**Time-of-day colours:** the background changes with the time — warm sunrise in the morning (5 am–12), sky blue in the afternoon (12–5 pm), sunset coral in the evening (5–9 pm) and deep navy at night (9 pm–5 am). On Today, each dose group is tinted and labelled by its own period. Colours are in `src/period.ts`.

All timing rules (meal offset, scan window, missed-after, follow-up, snooze) are adjustable in Settings (gear icon on Today).

## Run it

Text reading uses Google ML Kit, a native module, so the app runs as a **development build**, not Expo Go.

```bash
npm install
npm test                 # matcher + schedule unit tests
npx expo prebuild        # generates ios/ and android/
```

**Android phone (easiest)**
```bash
npx expo run:android               # phone connected by USB with developer mode, or
npx eas-cli build -p android --profile development   # cloud build → installable APK
npx expo start --dev-client        # then open the installed app
```

**iPhone**
- Needs a Mac with Xcode (`npx expo run:ios --device`) or EAS cloud build (`npx eas-cli build -p ios --profile development`), which requires an Apple Developer account.

**Release builds:** `npx eas-cli build --profile preview` (internal APK / ad-hoc iOS) or `--profile production` for the stores.

## Install from the cloud

**Android** — every push to `main` builds an APK on GitHub Actions and publishes it under **Releases**.
1. On the phone, open the repo's Releases page (signed in to GitHub) and tap `MedSync-N.apk`.
2. Allow "Install unknown apps" for the browser when Android asks, then install.
3. Open MedSync and allow notifications and camera.
Updates: install the newer APK over the old one; data is kept.

**iPhone** — Apple only allows installs through TestFlight or the App Store, which needs an Apple Developer account ($99/year).
1. Create a free account at expo.dev and an access token (Account settings → Access tokens).
2. In GitHub: Settings → Secrets → Actions → add `EXPO_TOKEN`.
3. One time, on a computer: `npm install && npx eas-cli login && npx eas-cli build -p ios --profile production` — this links your Apple account and creates the certificates.
4. Afterwards, run the **iPhone (TestFlight)** workflow from the Actions tab. The build appears in TestFlight on your iPhone in about 20–30 minutes.

## Notes and limits

- **Reminders vs alarms:** iPhone apps can't ring a true alarm. Reminders are notifications with sound and follow Focus/silent mode. Breaking through silent needs Apple's Critical Alerts entitlement (apply separately).
- **Android:** allow notifications and "Alarms & reminders", and turn off battery optimisation for MedSync (important on Xiaomi, Oppo, Vivo, Samsung).
- **Strip reading** works best with the name filling the frame and no foil glare — tilt the strip slightly. Add other names printed on the strip (e.g. the generic name) under "Other names on the strip" for more reliable matches.
- Reminders are rebuilt every time the app opens or the schedule changes. A course with an end date stops reminding after the next app open past that date.
- This app helps people keep track of medicines. It doesn't replace a doctor's or pharmacist's instructions.

## Code map

| Path | Purpose |
|---|---|
| `src/types.ts` | Data model: members, medicines, doses, logs, stock events |
| `src/schedule.ts` | Dose times, today's occurrences, due window, missed detection, reminder grouping (pure, tested) |
| `src/match.ts` | Strip text / barcode matching with OCR-error tolerance and strength check (pure, tested) |
| `src/notifications.ts` | Notification channel, actions, rescheduling, snooze |
| `src/store.tsx` | State + AsyncStorage persistence, stock accounting, missed-dose sweep |
| `app/(tabs)/index.tsx` | Today timeline |
| `app/(tabs)/scan.tsx` | Camera, barcode + OCR, green/red result |
| `app/(tabs)/meds.tsx`, `app/med/[id].tsx` | Schedule list and medicine editor |
| `app/(tabs)/inventory.tsx` | Stock, refills, history, CSV export |
| `app/member/[id].tsx`, `app/settings.tsx` | Family members, meal times, timing settings |
