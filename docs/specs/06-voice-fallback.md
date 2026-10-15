# Spec 06 — Spoken announcements when the phone has no voice for the language

## Problem
Announcements use the phone's own text-to-speech voices. Many phones have no Bengali or Hindi voice installed, and
installing one needs internet once. Until now, a Bengali or Hindi announcement on such a phone was **silent** (an
English voice cannot read Bengali script), even though the member settings promised English.

## Behaviour
1. Speak in the member's language when the phone has that voice.
2. Otherwise speak the **same message in English** (scan results, the "time for your medicine" announcement and the
   "Hear an example" button all pass an English version).
3. Only if no English voice works either: silence, and the on-screen text explains why.
4. The result text on screen is always shown, so nothing depends on sound.

## What the person sees
* Scan screen, under the result: "Said in English — no voice for this language on this phone (see family member settings)".
* Family member settings: the existing warning ("no Bengali voice yet — it will speak English until one is added",
  with the steps to install one) now matches what actually happens. After "Hear an example" falls back, it says so.

## Installing a voice (shown in member settings)
* Android: Settings → Text-to-speech → Google → Install voice data → choose the language.
* iPhone: Settings → Accessibility → Spoken Content → Voices → choose the language → download.

## Not in scope
Bundling voices inside the app (large downloads per language) — revisit if many users can't install voices.
