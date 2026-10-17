# DoseSure privacy policy

_Last updated: 17 October 2026_

DoseSure is a free app that helps a family keep track of medicines: schedules, reminders, checking strips and
bottles by photo, and stock. It has **no account**, **no ads** and **no tracking**, and the developer runs **no server**
that receives your data.

## What the app stores, and where
Everything you enter or the app records stays **on your phone**, in the app's own storage:
family members' names, medicines and schedules, dose history (taken / missed), stock counts, prescription photos
you scan, and pharmacies you add (name and phone number).

Uninstalling the app deletes all of it. The developer cannot see, recover or delete it, because it never leaves
your phone.

## What happens on the phone
* **Reading text from photos** is done on the phone.
  * **iPhone:** Apple's built-in text reader (Apple Vision, part of iOS). Nothing is sent anywhere. If it can't read
    a photo, the app uses Google ML Kit instead (below).
  * **Android:** Google ML Kit's on-device text recognition. According to Google, ML Kit may send anonymous usage
    and performance statistics to Google; it does not send your photos or the text read from them.
* **Spoken announcements** use your phone's built-in text-to-speech voices.
* **Reminders** are scheduled on the phone. There is no push-notification server.

## When data leaves the phone — only when you choose
* **Backup file.** "Save a backup" creates a file with your medicines, schedules and history and opens your phone's
  share sheet. Where it goes (Google Drive, email, WhatsApp…) is your choice. It contains health information — keep
  it private. Photos are not included.
* **Problem report.** "Report a problem" opens an email to the developer with what you chose and typed, and (if you
  leave it on) the app version, phone model and how many medicines and people are in the app — no names or medicines.
  You see the email and press Send yourself.
* **Finding a medicine.** "Find nearby on Google Maps" and calling or messaging a pharmacy open the Maps, phone or
  WhatsApp app with the medicine name; what happens there is covered by those apps' own policies.

The App Store and Play Store versions keep no training photos. Test versions shared directly with family and friends
(not from a store) can, if the helper switches it on, keep photos of strips and let them be exported or emailed to
the developer to improve the scanner — again only when that person presses Send.

The app never sends any of these anywhere by itself.

## Permissions
* **Camera** — to scan strips, bottles, boxes and prescriptions.
* **Photos** (when you pick a picture) — to read a prescription or strip photo you choose.
* **Notifications** — for medicine reminders.
* **Contacts** (only when you pick a pharmacy from your contacts) — to fill in its name and phone number. Nothing is
  uploaded, and the app does not read your other contacts.

## Children
DoseSure is meant to be set up by adults for themselves and their family. It does not knowingly collect anything
from anyone, because it collects nothing.

## Medical safety
DoseSure is a reminder and record-keeping aid. It is not a medical device and does not diagnose, treat or give
medical advice. It does not work out doses: the amount shown is what you or your family entered from the
prescription, and a prescription read from a photo is only a draft to check. The scanner can be wrong — always read
the name and strength on the strip yourself. Follow your prescription and ask your doctor or pharmacist before
changing anything. In an emergency call your doctor or emergency services (112 in India).

## Changes
If a future version adds anything that sends data off the phone (for example, optional sharing of photos of
unrecognised strips to improve the app), it will be off by default, ask you each time, and this policy will be
updated before that version is released.

## Contact
Questions, problems or privacy requests: use **Report a problem** in the app, email paniaron@gmail.com, or open an
issue at https://github.com/aronipani/medsync/issues

Because DoseSure keeps your data only on your phone, the developer holds no personal data about you to access,
correct or delete; deleting the app removes everything.
