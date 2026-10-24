# TestFlight texts (beta)

Paste into App Store Connect → TestFlight. Plain text: TestFlight doesn't render formatting.
* **Beta App Description** and **Beta App Review notes**: TestFlight → Test Information (whole app).
* **What to Test**: per build (TestFlight → the build → Test Details). Add a "New in this build" line at the top.
* Feedback email: paniaron@gmail.com.

Keep these in step with the app's menu names and with spec 19 (full disclosure for US testers).

## Beta App Description
```
TakeSure is a free medicine reminder for families who look after parents' medicines — in India, or from anywhere in the world. Made for Indian medicine strips, it also reads US medicine boxes and pharmacy labels.

- Medicines: each family member has their own list and meal times. Doses can be before, with or after a meal, or at a set time; half tablets are allowed. Add a medicine by scanning it, typing it, or from a photo of a prescription (you check what it read before saving).
- Reminders: one reminder per time for the whole family, plus a "Not taken yet" follow-up. Family members in another time zone follow their own clock.
- Check the strip: at dose time, scan the strip or box. Green means it matches a medicine on your list for now; "Not a match" means scan the next one; if the photo can't be read clearly, it asks you to check the name instead of guessing. Results are spoken in English, Hindi, Bengali and 10 more languages.
- Supplies: how many are left, how long they last, expired strips, a buy list for the pharmacy, and a log of every dose.
- Safety: warns when one person has two medicines with the same ingredient.
- Backup: save everything to one small file, and send one person's medicines to a family member's phone.

No account, works offline, and everything stays on your phone.

In the US, the strip check at dose time is off until you turn it on (Settings > Scanning) after reading what it can and can't do.

TakeSure is a reminder and record-keeping aid. It is not a medical device, has not been reviewed or cleared by the FDA, and does not diagnose, treat or decide doses: the amounts are the ones you enter from the prescription. The scanner can be wrong; when in doubt, ask your pharmacist.
```

## What to Test
```
Thanks for testing TakeSure! Free, no account, works offline, and everything stays on your phone.

PLEASE TRY:

1. Getting started
- Open the app and read the safety notice, then tap "I agree".
- Add a medicine: Today > "Add a medicine". Try scanning the strip, typing it, and a photo of a prescription (check what it read before saving).
- Add a family member: Settings > Family. Give them their usual meal times.

2. Reminders
- Do reminders arrive on time? Try "Scan now" and "Remind me later".
- Leave a dose open and check that a "Not taken yet" reminder comes.

3. Check the strip (most important)
- In the US: first turn it on in Settings > Scanning (read the disclosure and tick the box).
- At dose time, scan the strip or box. Green should say "Matches your list"; another medicine should say "Not a match".
- Try hard cases: worn or cut strips, shiny strips, upside down, low light, and another family member's medicine.
- Does the spoken result play in the right language?

4. Supplies and history
- After "I took it", check Today and Medicines > Supplies. Does the count go down? Is "lasts about N days" sensible?
- Try a refill, the low-stock warning and the buy list.

5. Backup
- Settings > Your data: save a backup, then try restoring it.

PLEASE REPORT:
- Most important: a GREEN result for the wrong medicine.
- Anything wrong, confusing or slow, with your phone model and a screenshot if you can.
- Use TestFlight's screenshot feedback, Settings > Help > Report a problem, or email paniaron@gmail.com.

TakeSure is not a medical device and doesn't replace your doctor's or pharmacist's instructions.
```

## Beta App Review notes (Test Information → Review notes; sign-in NOT required)
```
TakeSure does not use accounts or sign-in. All data is stored on the device.

To review:
1. Open the app, read the safety notice and tap "I agree".
2. On Today, tap "Add a medicine" > "Other ways to add" > "Type it in". Add any medicine you have (for example "Tylenol 500"), 1 tablet, at a time 2-3 minutes from now. Allow notifications.
3. On a US device the strip check at dose time is OFF by default (it goes beyond FDA's medication-reminder category). To try it: Settings > Scanning > "Turn on scanning", read the disclosure, tick "I have read this and understand it", then "Turn on scanning".
4. When the reminder arrives, tap "Scan now" and point the camera at that medicine's box or strip: green "Matches your list". Any other medicine shows "Not a match", which is expected. The scanner is tuned for Indian strips, so a US box may need a second try.
5. Tap "I took it": Today shows it as taken, and Medicines > Supplies shows one fewer.

The camera is used only to read medicine strips and prescriptions on the device. Notifications are for dose reminders. TakeSure is not a medical device and does not calculate doses; amounts come from the prescription the user enters.
```
