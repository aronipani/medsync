# TakeSure privacy policy

_Last updated: 24 October 2026_

TakeSure is a free app that helps a family keep track of medicines: schedules, reminders, checking strips and
bottles by photo, and stock. It has **no account**, **no ads** and **no tracking**. The App Store and Play Store versions send **nothing** to
any server run by the developer: your data stays on your phone.

## What the app stores, and where
Everything you enter or the app records stays **on your phone**, in the app's own storage:
family members' names, medicines and schedules, dose history (taken / missed), stock counts, prescription photos
you scan, photos of each medicine's strip that the app keeps to recognise it, and pharmacies you add (name and phone
number).

Uninstalling the app deletes all of it. The developer cannot see, recover or delete it, because it never leaves
your phone.

## What happens on the phone
* **Reading text from photos** is done on the phone.
  * **iPhone:** Apple's built-in text reader (Apple Vision, part of iOS). Nothing is sent anywhere. If it can't read
    a photo, or when a scan matches nothing, the app also reads the photo with Google ML Kit, on the phone (below).
  * **Android:** Google ML Kit's on-device text recognition. According to Google, ML Kit may send anonymous usage
    and performance statistics to Google; it does not send your photos or the text read from them.
* **Spoken announcements** use your phone's built-in text-to-speech voices.
* **Reminders** are scheduled on the phone. There is no push-notification server.

## When data leaves the phone — only when you choose
* **Backup file.** "Save a backup" creates a file with your medicines, schedules and history and opens your phone's
  share sheet. Where it goes (Google Drive, email, WhatsApp…) is your choice. It contains health information — keep
  it private. Photos are not included.
* **A person's medicines.** Settings → Family → "Send …'s medicines" makes a file with that person's medicines, dose
  times and recent doses and opens the share sheet, so a family member can open it in TakeSure on their phone.
* **Medicine history for the doctor.** Settings → Your data → "Share medicine history" makes a spreadsheet of doses
  and refills and opens the share sheet.
* **Problem report.** "Report a problem" opens an email to the developer with what you chose and typed, and (if you
  leave it on) the app version, phone model and how many medicines and people are in the app — no names or medicines.
  You see the email and press Send yourself.
* **Finding a medicine.** "Find nearby on Google Maps" and calling or messaging a pharmacy open the Maps, phone or
  WhatsApp app with the medicine name; what happens there is covered by those apps' own policies.

## Test versions (not from a store)
The App Store and Play Store versions keep no training photos and never contact the TakeSure server. Test versions
shared directly with family and friends (installed from GitHub, not from a store) can, if the helper switches it on,
keep photos of strips and send them to improve the scanner —
only when that person presses Send. They go to the TakeSure server anonymously (the photo, the medicine name and
what the scanner read; no name, account, phone id or exact time), or by email in builds without the server. The
server removes photo metadata and deletes training photos after 2 years.

The app never sends any of these anywhere by itself.

## Permissions
* **Camera** — to scan strips, bottles, boxes and prescriptions.
* **Photos** (when you pick a picture) — to read a prescription or strip photo you choose.
* **Notifications** — for medicine reminders.
* **Contacts** (only when you pick a pharmacy from your contacts) — to fill in its name and phone number. Nothing is
  uploaded, and the app does not read your other contacts.

## Children
TakeSure is meant to be set up by adults for themselves and their family. It does not knowingly collect anything
from anyone, because it collects nothing.

## Medical safety
TakeSure is a reminder and record-keeping aid. It is not a medical device and does not diagnose, treat or give
medical advice. It does not work out doses: the amount shown is what you or your family entered from the
prescription, and a prescription read from a photo is only a draft to check. The scanner can be wrong — always read
the name and strength on the strip yourself. Follow your prescription and ask your doctor or pharmacist before
changing anything. In an emergency call your doctor or emergency services (112 in India, 911 in the US). The terms of use are at https://aronipani.github.io/takesure/terms/.

## Changes
If a future version adds anything that sends data off the phone (for example, optional sharing of photos of
unrecognised strips to improve the app), it will be off by default, ask you each time, and this policy will be
updated before that version is released.

## Contact
Questions, problems or privacy requests: use **Report a problem** in the app (Settings → Help), email
paniaron@gmail.com, or see https://aronipani.github.io/takesure/

Because TakeSure keeps your data only on your phone, the developer holds no personal data about you to access,
correct or delete; deleting the app removes everything.
