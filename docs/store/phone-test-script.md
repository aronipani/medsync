# TakeSure — phone test script (before submitting)

Run this on the iPhone with the AltStore build now, and again on the TestFlight build after Sunday.
Write ✅ or ❌ next to each check. For any ❌, note what you saw and take a screenshot.
Takes about 1–1½ hours. Have 2–3 real strips ready (e.g. Clopilet 75, Pantodac 40) and one strip of a medicine you
will NOT add, plus a printed prescription.

The bottom bar is the same for everyone: **Today · Scan · Medicines · Settings**. Settings is one list: Family,
Reminders, Scanning, Your data, Privacy & safety, Help. Medicines has two parts at the top: **Medicines · Supplies**.

---

## 1. Fresh install and safety notice
1. Install the new TakeSure build (it sits next to the old MedSync/DoseSure app).
2. Open it.
- [ ] The safety notice ("Before you start") appears before anything else.
- [ ] It says TakeSure is **not a medical device**, **does not work out doses**, the **scanner can be wrong**, and
      prescription photos are **only a draft**, with the terms of use in brief.
3. Tap **I agree**. Close and reopen the app.
- [ ] The notice does **not** appear again.

## 2. Backup from the old app, restore in TakeSure
1. Open the **old** app (its own menus) → Family helper → Settings → Everyday → **Save a backup** → save to Files or
   send to yourself on WhatsApp.
2. Open **TakeSure** → Settings → **Your data** → **Restore from a backup** → **Restore…** → pick the file.
- [ ] It shows what is in the file (people, medicines) before restoring.
3. Confirm.
- [ ] "Restored" message. Medicines, people, dose history and stock counts all match the old app.
- [ ] The notice from step 1 does not come back (this phone keeps its own agreement).
- [ ] The line at the bottom of Settings starts with "TakeSure".

## 3. Reminder arrives
1. Medicines → **+ Add a medicine** (or **+ Add a medicine for …**) → **Other ways to add** → **Type it in**.
2. Enter a medicine you have a strip of (e.g. Clopidogrel 75), 1 tablet, at a clock time **3 minutes from now**.
   Save.
3. Lock the phone and wait.
- [ ] Reminder "💊 Medicine time · …" arrives on time with the medicine name and amount.
- [ ] Long-press it: buttons **Scan now** and **Remind me later**.
4. Tap **Remind me later**.
- [ ] It comes back later.
5. Don't take it. Wait for the follow-up.
- [ ] A second reminder "⏰ Not taken yet" arrives.

## 4. Scan the right strip, then a wrong one
1. From the reminder tap **Scan now** (or open the Scan tab). Point at the right strip, printed side, good light.
- [ ] Green screen: **"Matches your list"**, "Take 1 tablet", medicine name.
- [ ] The voice says the medicine is on your list and how much to take (never "correct" or "wrong medicine").
2. Don't press **I took it** yet. Tap **Close** and scan the strip of a medicine you did **not** add.
- [ ] Red screen **"Not a match"** with a **Scan next** button.
3. Try the scan once with the person's language set to Hindi or Bengali (Settings → Family → the person) if you use it.
- [ ] The spoken sentence sounds natural. Note any wording you'd change.

## 5. "I took it" updates Today and Supplies
1. Scan the right strip again → **I took it**.
- [ ] Today shows the dose as ✓ Taken with the time.
- [ ] Medicines → **Supplies**: that medicine's count is 1 lower.
2. On Today, tap the taken dose → **I did not take it** → **Change back**.
- [ ] It goes back to due, and the count goes back up.

## 6. Prescription photo is only a draft
1. Medicines → **+ Add a medicine** → **Other ways to add** → **Photograph a prescription**.
2. Photograph a printed prescription.
- [ ] A review screen opens listing what was read; nothing is added yet.
- [ ] **Update schedule** stays disabled until every line is marked **Matches ✓** or corrected.
3. Tap **Discard prescription** (or leave without saving).
- [ ] The Medicines list is unchanged.

## 7. Permissions denied
1. iPhone Settings → TakeSure → turn **Camera** off. Open the Scan tab.
- [ ] The app explains the camera is needed and how to turn it on. No crash, no black screen forever.
2. Turn Camera back on. iPhone Settings → TakeSure → **Notifications** off.
3. In TakeSure: Settings → **Reminders** → **Send a test reminder**.
- [ ] Message "Reminders are off" telling you to turn notifications on. No crash.
4. Turn Notifications back on and press **Send a test reminder** again.
- [ ] The test reminder arrives.
- [ ] TakeSure never asks for the microphone.

## 8. Airplane mode
1. Turn on Airplane mode. Repeat a quick scan of the right strip and press **I took it**.
- [ ] Scan, green result, voice and logging all work offline.
2. Add a reminder 2 minutes ahead and wait.
- [ ] It still arrives.

## 9. Largest text and VoiceOver
1. iPhone Settings → Accessibility → Display & Text Size → **Larger Text** → turn on and drag to the largest.
2. Open Today, Scan (show a green result), and a medicine page.
- [ ] Nothing is cut off so badly it can't be read; "Take 1 tablet" stays on screen.
3. Turn on **VoiceOver** (Settings → Accessibility → VoiceOver). Swipe through Today, Scan and Settings → Scanning.
- [ ] Every button and switch is read out with a name (including the torch button and photo thumbnails).
4. Turn VoiceOver and Larger Text back off.

## 10. Support and privacy links
1. Settings → **Help** → **Report a problem** → pick a problem → **Send**.
- [ ] An email opens addressed to the support address, with app version and phone model; you press Send yourself.
2. Settings → **Privacy & safety**.
- [ ] Safety points and "It leaves the phone only when you choose" shown; **Full privacy policy** opens and says
      **TakeSure**; **Full terms of use** opens.
3. Settings → **Your data**.
- [ ] In the **store/TestFlight** build there is **no** "Photos for improving the scanner" section.
      (The AltStore test build still has it — that's expected.)

---

## When everything is ✅
Record the reviewer video (step 4 with an Indian strip, 30–60 s), then take the screenshots with the demo family
below.

## Demo family for screenshots (generic names, no brand names)
| Person | Medicine (type it in) | When |
|---|---|---|
| Papa | Clopidogrel 75 mg tablet | after breakfast |
| Papa | Amiodarone 200 mg tablet | after lunch |
| Papa | Nebivolol 2.5 mg tablet | after dinner |
| Papa | Isosorbide Mononitrate 10 mg tablet | morning and evening |
| Ma | Pantoprazole 40 mg tablet | before breakfast |
| Ma | Torsemide 10 mg tablet | after breakfast |
| Ma | Finerenone 10 mg tablet | after lunch |
| Ma | Sucralfate syrup 10 ml | before dinner |

For the scan screenshot, use a generic-labelled strip (e.g. Jan Aushadhi, which prints the generic name) or one where
the brand isn't readable in the frame.
