# Spec 07 — Sharing photos of unrecognised strips (opt-in)

## Problem
Strips the app can't recognise are the most useful training examples — but they live on people's phones. Sending
them must not compromise privacy: a strip photo reveals a health condition even with no name on it, and photos can
show hands, rooms, pharmacy stickers with the patient's name, and carry GPS location in the file.

## Principles
1. **Off by default.** Nothing is ever sent unless the person switched sharing on.
2. **Asked every time**, showing the exact image and the exact details that would be sent.
3. **Nothing that identifies the person or the phone** is sent.
4. **Works on poor connections**: shared photos wait on the phone and go when there is Wi-Fi.
5. **Honest about deletion**: once sent anonymously, a photo can't be traced back to delete it. The consent screen
   says so.

## What is sent (and nothing else)
| Sent | Not sent |
|---|---|
| The photo, re-saved (location and camera details removed), at most 1600 px, cut to the strip once the strip detector is in the app | Original photo file, its location (GPS), camera model |
| The medicine name, **only if the person typed or picked it** | Text read from the photo (it can contain the patient's name on a pharmacy sticker) |
| Month of capture (e.g. 2026-10), app version, Android/iPhone | Exact time, family member, schedule, any id of the person or phone |

Prescriptions are never offered for sharing.

## Flow
* Settings → **Help improve recognition** (off). Turning it on shows the principles above and needs **Turn on**.
* After a scan the app could not recognise (red "not recognised", or scan-to-add with no brand found), if sharing is
  on: a card "Help the app learn this strip?" → preview screen with the prepared image, the details list, an optional
  "What medicine is it?" field, and **Share** / **Don't share**.
* Shared items go to a queue on the phone (`share-queue/`). They are sent on Wi-Fi, in the background when the app is
  open; failures retry later. Settings shows "2 photos waiting to send" with **Delete waiting photos**.
* Turning sharing off deletes anything still waiting.

## Server (decision needed before this ships)
The app has no server. Sending needs an upload endpoint that accepts anonymous image uploads with rate limiting
(e.g. a storage bucket behind a small function). Until `SHARE_ENDPOINT` is configured, the whole feature stays
hidden in the app. PRIVACY.md must be updated before release.

## Built now
`src/share.ts`: the exact record that would be sent (`shareRecord`) and the availability switch. Tests check that
nothing identifying can get into the record. The screens and queue are built when the server is chosen.

## Tests (`tests/share.test.ts`)
* Only month, app version, platform and a typed/picked name are in the record; text read from the photo, member and
  times are never included even if passed in.
* Typed names are trimmed and limited in length; empty names are left out.
* Sharing is unavailable when no endpoint is configured.
