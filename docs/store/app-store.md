# App Store listing and review pack (iPhone, v1.0)

Everything to paste into App Store Connect, plus the rules a Medical-category app is checked against.
Companion to spec 08 (release checklist). v1 is the **offline app only**: no server, no account, no training photos
(store builds set `EXPO_PUBLIC_STORE_BUILD=1` in `eas.json`, see `src/edition.ts`).

## App identity (fixed once uploaded)
| Field | Value |
|---|---|
| Bundle ID | `com.takesure.app` (iPhone and Android; was `com.medsync.family` in test builds) |
| SKU | `takesure-ios-1` |
| Primary category | Medical |
| Secondary category | Health & Fitness |
| Price | Free, no in-app purchases |
| Devices | iPhone only (`supportsTablet: false`) |
| Encryption | `ITSAppUsesNonExemptEncryption: false` in app.json (the app uses no encryption beyond iOS's own) |

Test builds installed before the ID change are a different app: back up in the old app, restore in the new one.

## Category: Medical first, Health & Fitness second
Apple's definitions: **Medical** covers medical information management, record-keeping and health tracking for
patients; **Health & Fitness** covers healthy living (fitness, stress, weight loss, meditation). TakeSure manages a
family's prescribed medicines and dose records, so **Medical** is the accurate primary category (a wrong category is
itself a 2.3 rejection reason). **Health & Fitness** as secondary adds browsing reach at no cost.
* Medical apps get closer review (1.4.1), whichever category is chosen — the checklist below covers it.
* Both categories trigger the regulated-medical-device declaration in the EU/EEA, UK and US; India-only keeps it out
  of scope (see Availability).
* Google Play (later): category **Medical**, and fill in the Health apps declaration ("medication reminders /
  management").

## Availability: India first
* **Pricing and Availability → India only** for v1. The app is made for Indian medicine strips, voices and
  pharmacies (112 emergency number, Indian languages), so the store listing matches what the app does.
* Apple's **regulated medical device declaration** is required only for apps sold in the **EU/EEA, UK or US** in
  the Medical or Health & Fitness category (or with "Frequent" medical information in the age rating). India-only
  avoids it. If you add those countries later, declare **No** (not a regulated medical device) for each region:
  App Information → App Store Regulations & Permits → Declare Regulated Medical Device.
* Adding countries later (e.g. Bangladesh, Nepal, UAE, UK for the Indian diaspora) needs no new build.

## Listing text
**Name (30):** `TakeSure: Medicine Reminder`
Chosen 17 Oct 2026 ("DoseSure" was taken by a similar app; "Strip" names read badly in search). Check it is free in
App Store Connect when creating the app, and in the Indian trademark register (class 9). Fallbacks: `TakeSure – Family Medicines`,
`TakeSure Medicine Tracker`.

**Subtitle (30):** `Medicine reminders for India`

**Promotional text (170, can change without review):**
Made for Indian medicine strips. Reminders for the whole family, a quick strip check at dose time, and stock that
counts itself down. Free, offline, no account.

**Description:**
TakeSure helps families in India keep track of daily medicines, especially for parents and grandparents who take
many tablets a day.

• Reminders for each family member, set around their breakfast, lunch and dinner — one reminder for everything due
  at that time.
• Check the strip before taking it: point the camera at the medicine strip or box. TakeSure reads the printed name and
  shows green when it matches a medicine due now, with the amount from your list, spoken in English, Hindi, Bengali
  and 10 more languages. Red "Not a match" when it doesn't.
• Made for Indian strips: worn and half-cut strips, brand and generic names, and other brands with the same
  medicine.
• Every dose logged as taken, missed or skipped; stock goes down by itself, with a warning before it runs out and a
  buy list to show at the pharmacy.
• A warning when two medicines for one person contain the same ingredient.
• Add medicines by typing, scanning the strip, or from a photo of the prescription — always checked by you before
  saving.
• Large text and simple screens, made for older people.
• Free. No account, no ads, no tracking. Everything stays on your phone; back it up to a file you keep.

TakeSure is a reminder and record-keeping aid. It is not a medical device and does not diagnose, treat or give
medical advice. It does not work out doses — the amount shown is what you entered from the prescription. The scanner
can be wrong: always read the name and strength on the strip yourself, and follow your doctor's and pharmacist's
instructions.

Terms of use: https://aronipani.github.io/takesure/terms/

**Keywords (100, comma-separated, no spaces after commas):**
`medicine reminder,tablet,pill,strip scanner,family,elderly,parents,dose log,refill,stock,India,hindi`
No medicine brand names or other apps' names (guideline 2.3.7 / 5.2.1).

**Support URL:** https://aronipani.github.io/takesure/
**Privacy policy URL:** https://aronipani.github.io/takesure/privacy/
**Marketing URL:** leave empty.
**Copyright:** `2026 Aroni Pani`

## Screenshots
* Required: 6.9" iPhone (1320 × 2868). Apple scales them for smaller iPhones.
* 4–6 screens: Today list · reminder · green scan · red "scan the next one" · stock / buy list · family members.
* Show the app as it really is, in use (2.3.3). No device frames with other brands, no claims like "100% accurate".
* Use **generic names** in the medicines shown (Clopidogrel 75, Pantoprazole 40, Metformin 500), not brand names
  like Clopilet or Pantodac — brand names are other companies' trademarks (5.2.1).
* English first; Hindi and Bengali sets can be added as localisations later.

## Age rating answers
* Medical or Treatment Information: **Infrequent** — the app shows the family's own medicine list, not medical
  content or treatment advice. (Choosing "Frequent" makes the EU/UK/US medical device declaration mandatory.)
* Everything else (violence, gambling, contests, web access, user-generated content, chat): **None / No**.
* Expected rating: 4+ (or the lowest band in the current scheme).

## App Privacy ("nutrition label")
Answer per data type; the developer receives nothing, but Apple counts what third-party SDKs send.
* **Diagnostics → Performance Data / Other Diagnostic Data:** collected by Google ML Kit (backup text reader on
  iPhone) — **not linked to the user, not used for tracking**, purpose **Analytics / App Functionality** (by Google).
  Google's ML Kit data disclosure lists device and app information and performance metrics.
  ML Kit stays in the iPhone build for v1: it is the backup reader when Vision fails, and the **second look** at a
  scan that matched nothing (spec 15, 2a) — the two readers make different mistakes, which helps with worn strips.
  Remove it only once scan traces show the second look rarely turns a scan green; then switch to **Data Not
  Collected**.
* Everything else: **not collected** (health data, photos, contacts and identifiers stay on the phone).
* Problem reports are emails the user chooses to write and send. Apple lets optional, user-initiated feedback that
  is clearly disclosed stay out of the label; it is described in the privacy policy (done).

## App Review Information
**Sign-in required:** No — **untick** "Sign-in required" (the app has no account).
**Contact:** your name, phone with country code (+1 …), email.
**Attachment:** the 30–60 s screen recording (reminder → scan an Indian strip → green → I took it). Attaching the
video file here is easier than a link.
**Notes for the reviewer (paste, under 4,000 characters):**
> TakeSure is a free medicine reminder for families in India. There is no account, no server and no in-app purchase;
> all data stays on the phone.
>
> How to try it (about 3 minutes):
> 1. On first launch, read the safety notice and tap "I agree".
> 2. On Today, tap "Add a medicine" → "Other ways to add" → "Type it in". Enter any medicine you have at hand with
>    its strength (for example "Tylenol 500"), 1 tablet, at a time 2–3 minutes from now, and save. Allow
>    notifications when asked.
> 3. IMPORTANT on a US device: the strip check at dose time is OFF by default in the United States, because it goes
>    beyond FDA's medication-reminder category. To try it: Settings → Scanning → "Turn on scanning" → read the
>    disclosure → tick "I have read this and understand it" → "Turn on scanning". (In India it is on by default.)
> 4. When the reminder arrives (or from the Scan tab), point the camera at that medicine's box or blister strip.
>    The app reads the printed name and shows green "Matches your list" with the amount you entered; anything else
>    shows red "Not a match" with "Scan next". Then tap "I took it".
> 5. Today shows the dose as taken, and the count in Medicines → Supplies goes down by one.
>    Without scanning, Today's "I took it" button records the dose too.
>
> The scanner is tuned for Indian medicine strips; the attached video shows it with Indian strips.
>
> Medical scope: TakeSure is a reminder and record-keeping aid, not a medical device. It does not identify medicines,
> diagnose, or calculate or suggest doses — the amount shown is exactly what the user entered from their
> prescription. Prescription photos are read on the phone into a draft that the user must check and save. The
> first-launch notice and Settings → Privacy & safety say this, and that the scanner can be wrong.
>
> Permissions: camera (scan strips and prescriptions), photos (choose a prescription photo), notifications
> (reminders), contacts (only when picking a pharmacy's phone number).
> Support: Settings → Help → Report a problem.

## The version page in App Store Connect (field by field)
| Field | What to put |
|---|---|
| Header asset (Header and Search Results) | Optional — leave empty for v1 |
| App Previews and Screenshots | Required: 6.9" iPhone screenshots (1320 × 2868), 4–6 of them (see Screenshots) |
| Promotional Text | From "Listing text" |
| Description | From "Listing text" (ends with the terms link) |
| Keywords | From "Listing text" (exactly 100 characters) |
| Support URL | https://aronipani.github.io/takesure/ |
| Marketing URL | Empty |
| Version | **1.0.0** — must match the build (`app.json` "version": "1.0.0"); "1.0" is a different version to Apple |
| Copyright | 2026 Aroni Pani |
| Routing App Coverage File, App Clip, iMessage App, Game Center | Not used — leave empty / unticked |
| Build | "+" → pick the processed EAS build 1.0.0 (n). Missing? It's still processing (TestFlight tab), or build and upload with `eas build -p ios --profile production --auto-submit` |
| Sign-in required | **Unticked** |
| App Store Version Release | **Manually release this version** for the first release: check the live page once more, then press Release |

Other pages to finish before "Add for Review" (left sidebar):
* **App Information:** name `TakeSure: Medicine Reminder`, subtitle, category Medical + Health & Fitness, content
  rights (no third-party content), age rating questionnaire, License Agreement = Apple's standard EULA. If US (or
  EU/UK) is in availability: Regulated Medical Device → **No** for each region.
* **Pricing and Availability:** Free; countries (see Availability).
* **App Privacy:** privacy policy URL, then the data types (see App Privacy).
* **App Accessibility** (optional): declare only what you tested on the phone (VoiceOver, Larger Text).

## Medical-category rules checklist (why apps like this get rejected)
| Guideline | What it asks | How TakeSure meets it |
|---|---|---|
| 1.4.1 Physical harm — medical apps | Greater scrutiny if data could be inaccurate; disclose how accuracy claims are backed; remind people to check with a doctor | No accuracy claims ("Matches your list", not "Correct medicine"); first-run notice and Settings → Privacy & safety: scanner can be wrong, read the strip, follow the doctor |
| 1.4.2 Drug dosage calculators | Must come from a manufacturer, hospital, pharmacy or approved body | The app never calculates doses; amounts come only from what the user enters. Said in the notice, the description and the review notes |
| 2.1 App completeness | Reviewer must be able to use every feature | Review notes with a no-strips path (any packaged medicine), plus a video for Indian strips. No hidden server features (spec 07/16 off) |
| 2.3 Accurate metadata | Description and screenshots match the app | Listing describes only what v1 does; no server, cloud backup or family sharing mentioned |
| 2.3.7 / 5.2.1 Keywords, trademarks | No other brands in keywords or screenshots | Generic medicine names in screenshots; no brand keywords |
| 5.1.1 Privacy policy | Link in App Store Connect and inside the app; explains what is collected, retained and deleted | PRIVACY.md (updated 24 Oct 2026), linked from Settings → Privacy & safety |
| 5.1.1 Permission strings | Each permission explains its use | Camera, photos, contacts strings in app.json |
| 5.1.1(ix) Highly regulated fields | Healthcare *services* must come from the provider | TakeSure is a personal tracker, not a healthcare service: no consultations, prescriptions or pharmacy orders |
| 5.1.3 Health data | No use for ads or data mining; don't store personal health information in iCloud | No ads, nothing uploaded; backup is a file the user saves where they choose |
| Privacy manifest | Required-reason APIs declared | `ios.privacyManifests` in app.json |
| Export compliance | Encryption question answered | `ITSAppUsesNonExemptEncryption: false` |

## India-specific notes
* Naming India in the subtitle, description and keywords is fine and helps reviewers understand why strips from
  their own country may not scan.
* Don't imply approval by CDSCO, the Ministry of Health or any pharmacy chain, and don't use Indian government
  emblems or the Ayushman Bharat / ABDM names.
* A reminder and tracking app is not a medical device under India's Medical Devices Rules as long as it doesn't
  diagnose, treat or calculate doses — keep it that way when adding features.
* Digital Personal Data Protection Act: obligations stay light because the developer receives no personal data.
  Revisit before the TakeSure server (spec 16) goes live.

## Public pages (24 Oct 2026)
The code repo is private, so the privacy policy, terms and support page live on GitHub Pages in the public repo
**aronipani/takesure**: https://aronipani.github.io/takesure/ (support), `/privacy/`, `/terms/`.
* Source of truth stays `PRIVACY.md` / `TERMS.md` here. After editing either: `npm run legal-docs` (updates the
  copy shown in the app, `src/legalDocs.ts`, and `site/`), then copy `site/*` into the takesure repo and push.
  A test fails if the app's copy is out of date.
* The app shows both documents in full offline (Settings → Privacy & safety, and the first-run notice), with
  "Open on the web" as the backup.
* No public issue tracker: reports come by email (Settings → Help → Report a problem) so nobody posts health details
  in public.

## Terms of use (added 20 Oct 2026)
* Keep Apple's **Standard EULA** in App Store Connect (App Information → License Agreement); TakeSure's own terms
  (`TERMS.md`) add to it and say so.
* Put the terms link in the description's last line and in the Support / Marketing URL page:
  https://aronipani.github.io/takesure/terms/
* The first-run notice (version 3) shows the terms in brief with **I agree**; the date is kept on the phone and shown
  in Settings → Privacy & safety. Raising `NOTICE_VERSION` asks everyone again.

