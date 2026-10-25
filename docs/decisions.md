# TakeSure — decisions log

Decisions from the App Store release work (17–25 Oct 2026), in one place. **You** = decided by Aroni;
**Agreed** = recommended and accepted or done at his request. Tester feedback goes to the same thread and is added at
the bottom as it comes in.

## Name, identity, listing
| Date | Decision | Who |
|---|---|---|
| 17 Oct | App name **TakeSure** ("DoseSure" taken by a similar app; no "Strip" in the name; MediSure, Dawaii, TabSure considered). Store name "TakeSure: Medicine Reminder" | You |
| 17 Oct | App id **com.takesure.app** on iPhone and Android (test builds before it are a separate app: back up and restore) | You |
| 17 Oct | Category **Medical**, secondary Health & Fitness | Agreed |
| 17 Oct | Say plainly the app is made for Indian medicines (subtitle, description) | You |
| 17 Oct | Keep the blister-strip-and-tick icon (no text, distinct from the other app's pill) | Agreed |
| 24 Oct | Version **1.0.0** in App Store Connect (must match the build) | Agreed |
| open | Countries for v1: India only (no medical-device declaration) vs India + US (declare "No") | You to decide |

## What v1 is (and isn't)
| Date | Decision | Who |
|---|---|---|
| 17 Oct | v1 is the **offline app**: no account, no server, data on the phone | Agreed |
| 17 Oct | Store builds keep **no training photos** (switch in `src/edition.ts`, set by EAS production) | You |
| 17 Oct | Medical wording: "Matches your list", never "correct/wrong medicine"; not a medical device; never calculates doses; prescription photos are drafts | Agreed |
| 17 Oct | **ML Kit stays** on iPhone for v1 (backup reader and second look); privacy label "Diagnostics, not linked" | You asked; agreed |
| 24 Oct | Store builds can never get a server address, even if one is set by mistake | Agreed |
| 24 Oct | Permissions: camera, photos, contacts, motion only — no microphone | Agreed |

## Server
| Date | Decision | Who |
|---|---|---|
| 17 Oct | One central, anonymous TakeSure server; **all frontier-model calls go through it**, which holds the only API key | You |
| 17 Oct | Training photos go to the server **anonymously** instead of your email (test builds first; public opt-in in v1.1) | You |
| 17 Oct | AWS **us-east-1** with **Terraform** (SAM removed); model reading off at first (`model_calls_per_day = 0`) | You |
| 17 Oct | Server in test builds now, in the store app from **v1.1** with opt-in and updated privacy label | Agreed |
| 17 Oct | DGX Spark for training (960 px retrain in NVIDIA's PyTorch container), not for serving | Agreed |

## Repo, policies, builds
| Date | Decision | Who |
|---|---|---|
| 24 Oct | Code repo **aronipani/medsync private** | You |
| 24 Oct | Privacy policy, terms and support on a separate **public repo aronipani/takesure** (GitHub Pages); full text also shown inside the app, offline | You (option 2) |
| 24 Oct | No public issue tracker; support by email and Report a problem | Agreed |
| 24 Oct | App Store builds with **EAS** from your PC (`npx eas-cli@latest build -p ios --profile production --submit`); a friend's Mac only for screenshots/debugging | Agreed |
| 24 Oct | Builds cancel older runs and skip docs/training-only pushes (Actions budget ran out 20–23 Oct) | Agreed |
| 25 Oct | TestFlight for family and friends through a **public link** (no codes) | Agreed |

## Safety and ease of use (24 Oct review)
| Date | Decision | Who |
|---|---|---|
| 24 Oct | A printed strength that disagrees always wins; QR text and taught strips get the full checks; result dropped if the person changed mid-scan | Agreed (fix) |
| 24 Oct | Reminders: one-off for courses ending soon; stay under iOS's 64; none for other-time-zone members; due across midnight | Agreed (fix) |
| 24 Oct | Today: day arrows at the top; Today tab returns to today; Tomorrow/Yesterday | You asked; done |
| 24 Oct | Ask for reminders after the first medicine; "Reminders are off — turn on" on Today | Agreed |
| 24 Oct | Expired strip: main button "Scan another strip" | Agreed |
| 24 Oct | "Taking this medicine" switch (Stopped), stock "not counted yet" until entered | Agreed |

## First setup (v1.1)
| Date | Decision | Who |
|---|---|---|
| 25 Oct | **No separate caregiver vs user modes.** First setup asks one question, "Who will take the medicines?": **Me** · **Someone in my family, on this phone** · **Someone in my family, on their phone**. The answer sets defaults and wording only; everything stays changeable in Settings → Family. Built with spec 22's guided setup in **v1.1**, not in the first submission. | You |

## Left for after launch
* Cancel / discard on the medicine editor; a lighter prescription check; guided first setup (spec 22).
* Deploy the server; opt-in photo sharing; frontier-model strip reading; family circle.
* Android on Google Play (12 testers for 14 days first).

## Tester feedback
_Added here as it comes in (date · who/where · what · decision)._
