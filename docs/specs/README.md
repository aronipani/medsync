# DoseSure feature specs (formerly MedSync)

| # | Feature | Status |
|---|---|---|
| [01](01-backup-restore.md) | Backup and restore to a file | Built |
| [02](02-duplicate-medicine-warning.md) | Same-medicine (shared ingredient) warning | Built |
| [03](03-safety-and-privacy.md) | Safety notice, About & safety page, privacy policy | Built |
| [04](04-offline-medicine-list.md) | Large offline medicine list | Build step and lookups built; data source to choose |
| [05](05-expiry-dates.md) | Expiry dates from the strip | Built |
| [06](06-voice-fallback.md) | English speech when a language voice is missing | Built |
| [07](07-photo-sharing-consent.md) | Opt-in sharing of unrecognised strip photos | Record + rules built; hidden until a server exists |
| [08](08-store-release.md) | Play Store / App Store release checklist | Checklist |
| [09](09-prescription-photo-reading.md) | Prescription and chart photos read upright (bug fix) | Built |
| [10](10-region-detector-and-text-readers.md) | Region detector (YOLO) + Apple Vision / ML Kit readers | Built (trial model) |
| [11](11-test-scan.md) | Test scan and readiness check before the reminder | Built |
| [12](12-strip-scan-pipeline.md) | Strip scan pipeline end to end (flow diagrams), scan traces for retraining | Built |
| [13](13-add-photos-for-training.md) | Collect strip photos (camera or library, e.g. from friends); Send for training via share sheet | Built |
| [14](14-simple-for-older-people.md) | Simple for older people: Settings tabs, less on each screen, bigger controls, rules for new features | Built |
| [15](15-closed-set-strip-matching.md) | Recognise the household's own strips: closed-set matching, strip profiles, enrollment via the DoseSure server | Household matching built; enrollment to build |
| [16](16-dosesure-server.md) | DoseSure server: one anonymous backend for strip reading, catalogue, encrypted backups, family circle, training photos (`server/`) | Server built, not deployed; app side to build |
| [17](17-substitute-brands-and-finding-stock.md) | Substitute brands at the scan; buy list, pharmacies and family hand-off when a medicine runs out | Part A built (substitute brands at the scan and in other names); part B (buy list, pharmacies) to build |
