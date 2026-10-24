# TakeSure feature specs (formerly MedSync)

| # | Feature | Status |
|---|---|---|
| [01](01-backup-restore.md) | Backup and restore to a file | Built |
| [02](02-duplicate-medicine-warning.md) | Same-medicine (shared ingredient) warning | Built |
| [03](03-safety-and-privacy.md) | Safety notice, Privacy & safety page, privacy policy | Built |
| [04](04-offline-medicine-list.md) | Large offline medicine list | Build step and lookups built; data source to choose |
| [05](05-expiry-dates.md) | Expiry dates from the strip | Built |
| [06](06-voice-fallback.md) | English speech when a language voice is missing | Built |
| [07](07-photo-sharing-consent.md) | Opt-in sharing of unrecognised strip photos | Record + rules built (`src/share.ts`); opt-in screens and queue not built; hidden (`SHARE_ENDPOINT` empty). Test builds send training photos to the TakeSure server instead (spec 16) |
| [08](08-store-release.md) | Play Store / App Store release checklist | Checklist |
| [09](09-prescription-photo-reading.md) | Prescription and chart photos read upright (bug fix) | Built |
| [10](10-region-detector-and-text-readers.md) | Region detector (YOLO) + Apple Vision / ML Kit readers | Built (trial model) |
| [11](11-test-scan.md) | Test scan and readiness check before the reminder | Built |
| [12](12-strip-scan-pipeline.md) | Strip scan pipeline end to end (flow diagrams), scan traces for retraining | Built |
| [13](13-add-photos-for-training.md) | Collect strip photos (camera or library, e.g. from friends); Send for training via share sheet | Built |
| [14](14-simple-for-older-people.md) | Simple for older people: less on each screen, bigger controls, rules for new features | Built (its Settings tabs and helper view were replaced by spec 21) |
| [15](15-closed-set-strip-matching.md) | Recognise the household's own strips: closed-set matching, strip profiles, enrollment via the TakeSure server | Built: household matching, strip profiles, *Scan this strip once* on the phone (`app/enroll.tsx`), second look, look matching (iPhone), strength safety (24 Oct). To do: enrollment via the server, household index |
| [16](16-takesure-server.md) | TakeSure server: one anonymous backend for strip reading, catalogue, encrypted backups, family circle, training photos (`server/`) | Server and Terraform (`server/terraform/`) built, not deployed. App: training photos for test builds built; enrollment, cloud backup, family circle to build |
| [17](17-substitute-brands-and-finding-stock.md) | Substitute brands at the scan; buy list, pharmacies and family hand-off when a medicine runs out | Built: substitute brands, buy list, pharmacies, buy/pick-up reminders. To do: message languages, family hand-off, refill / Scan to add as another brand, lead-days setting |
| [18](18-us-medicine-list.md) | US medicine list (FDA NDC Directory), looked up only by NDC; US pharmacy labels and their directions | Built; list empty until the monthly job (or `npm run medicine-list:us`) first runs |
| [19](19-us-launch.md) | Reaching Indian families in the US: TestFlight beta, full disclosure, App Store US listing | Plan; built: US dose-scan switch with disclosure, members in another time zone |
| [20](20-share-a-person.md) | Send one person's medicines to another phone (caregiver anywhere) | Built |
| [21](21-regrouping.md) | One obvious place for everything: Settings as six pages, Privacy & safety page, Medicines · Supplies | Built (Oct 2026) |
| [22](22-first-setup-and-help.md) | First setup by doing (who it's for, meal times, one medicine, practice scan, colours), first-time tips, How to use TakeSure | Spec; built: How to use TakeSure (Help) with the colour key |
