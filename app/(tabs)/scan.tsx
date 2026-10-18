import { BarcodeScanningResult, BarcodeType, CameraView, useCameraPermissions } from 'expo-camera';
import { useCurrentMember } from '../../src/currentMember.tsx';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect, useIsFocused, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { MemberPicker } from '../../src/components.tsx';
import { CollectCard } from '../../src/components/CollectCard.tsx';
import { householdMatch, householdWords } from '../../src/household.ts';
import { lookAt, lookLabel } from '../../src/look.ts';
import type { LookVerdict } from '../../src/lookMatch.ts';
import { withNewReference } from '../../src/profileFiles.ts';
import { findConflict, matchBarcode, matchDetail, matchText, readsAsMedicine } from '../../src/match.ts';
import { diagnoseScan, type ScanDiagnosis } from '../../src/scanIssue.ts';
import { exchangeable, splitName, substituteCard } from '../../src/substitute.ts';
import { amountText, matchAnnouncement, phrase, spokenStrength, type LangCode, type PhraseKey } from '../../src/phrases.ts';
import { say, stopSpeaking, type SpeakStatus } from '../../src/speech.ts';
import { readBurst, readLinesAnyOrientation, readSecondLook, scanDetectorLabel, scanHints, scanReaderLabel, setHouseholdWords, startScanStats } from '../../src/ocr.ts';
import { loadRegionModel, setRegionDetectorEnabled } from '../../src/regionModel.ts';
import { readinessSummary, upcomingReadiness, type TestRecords } from '../../src/testScan.ts';
import { loadTestRecords } from '../../src/testScanStore.ts';
import { bestLearned } from '../../src/learn.ts';
import { saveTrainingPhotos, saveUnlabelledPhotos } from '../../src/training.ts';
import { keepsTraining } from '../../src/edition.ts';
import { Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { describeTiming, dueNow, medLabel, notDueToday, occurrencesForDate, qtyLabel } from '../../src/schedule.ts';
import { useStore } from '../../src/store.tsx';
import { addDays, dateKey, fmt12 } from '../../src/time.ts';
import { expiryStatus, formatExpiry, parseExpiry } from '../../src/expiry.ts';
import type { LogMethod, Occurrence } from '../../src/types.ts';
import { Button, Card, Empty, Field, More, s, useTheme } from '../../src/ui.tsx';

const whiteChip = { backgroundColor: '#fff3', paddingHorizontal: 16, minHeight: 44, justifyContent: 'center' as const, borderRadius: 999, marginRight: 8, marginBottom: 8 };

const BARCODES: BarcodeType[] = ['qr', 'datamatrix', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'pdf417', 'itf14'];

type Result =
  | { kind: 'match'; occs: Occurrence[]; method: LogMethod; substitute?: string; learned?: boolean; expiry?: string } // green
  | { kind: 'check'; occ: Occurrence; method: LogMethod; expiry?: string; partial?: boolean; note?: string; byLook?: boolean } // amber: name matches, strength unreadable (partial: only part of the name read; note: why else to check; byLook: the name wasn't read, the strip looks like it)
  | { kind: 'brand'; occ: Occurrence; method: LogMethod; via: string; askDoctor?: boolean } // amber: another brand of exactly this medicine, first time (spec 17)
  | { kind: 'strength'; occ: Occurrence; found: string[]; detail: string } // stop: different strength printed
  | { kind: 'nomatch'; reason: string; detail?: string; tip?: string; code?: string; say: PhraseKey; weak?: boolean } // red; detail = raw text read (helpers only), tip = what to try; weak: amber, no verdict (unknown barcode)
  | { kind: 'unread'; diag: ScanDiagnosis; detail?: string }; // amber: too weak for a verdict — says what was wrong with the scan

export default function Scan() {
  const t = useTheme();
  const focused = useIsFocused();
  const { state, now, record, linkBarcode, addOtherName, teach, setExpiry, setProfile } = useStore();
  const [perm, requestPerm] = useCameraPermissions();
  const camera = useRef<CameraView>(null);

  // Default to the first family member who has something due.
  const firstDue = useMemo(() => state.members.find((m) => dueNow(state, now, m.id).length)?.id, [state, now]);
  // The person chosen on any screen stays chosen for the session; only with no one chosen does it fall back.
  const [chosen, setMemberId] = useCurrentMember();
  const memberId = chosen ?? firstDue ?? state.members[0]?.id;
  // Opened for a particular person (Today filtered to them, or a dose of theirs): scan for them.
  // `at` changes on every open, so it applies again even after switching person by hand.
  const params = useLocalSearchParams<{ memberId?: string; at?: string }>();
  useEffect(() => {
    if (params.memberId && state.members.some((m) => m.id === params.memberId)) setMemberId(params.memberId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.memberId, params.at]);

  const due = useMemo(() => dueNow(state, now, memberId), [state, now, memberId]);
  const [testRecords, setTestRecords] = useState<TestRecords>({});
  useFocusEffect(
    useCallback(() => {
      loadTestRecords().then(setTestRecords);
    }, []),
  );
  const ready = useMemo(() => readinessSummary(upcomingReadiness(state, testRecords, now, 24, memberId)), [state, testRecords, now, memberId]);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [torch, setTorch] = useState(false);
  const [typed, setTyped] = useState('');
  const lastCode = useRef({ code: '', at: 0 });
  // What the last strip reading saw (for "Teach this strip" and optional training photos).
  // `kept`: its photos are already saved for training; `reason`: why the result was red, if it was.
  const lastRead = useRef<{ lines: string[]; photos: string[]; kept?: boolean; reason?: string; readBy?: string; detector?: string; look?: string }>({ lines: [], photos: [] });
  useEffect(() => {
    setRegionDetectorEnabled(state.settings.regionDetector !== false);
    loadRegionModel(); // load the model before the first scan, not during it
  }, [state.settings.regionDetector]);
  const collectTraining = useRef(false);
  collectTraining.current = keepsTraining(state.settings);

  /** Photos of a scan nobody confirmed (red, unreadable, closed) are the hardest strips — keep them, unlabelled, for retraining. */
  const keepUnconfirmed = (reason?: string) => {
    const r = lastRead.current;
    if (!collectTraining.current || r.kept || !r.photos.length) return;
    r.kept = true;
    saveUnlabelledPhotos(r.photos, 'failed-scan', reason ?? r.reason ?? 'Closed without confirming.', r.lines.join('\n')).catch(() => {});
  };

  const forgetRead = () => {
    keepUnconfirmed();
    lastRead.current = { lines: [], photos: [] };
  };
  /** Closes a result and forgets its photo text, so nothing from it reaches the next scan. */
  const dismiss = () => {
    forgetRead();
    setResult(null);
  };
  useEffect(dismiss, [memberId]);

  const feedback = (ok: boolean) =>
    Haptics.notificationAsync(ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => {});

  /** Explain why something that isn't due right now didn't match. */
  const explainMiss = (isThis: (o: Occurrence) => boolean): { text: string; say: PhraseKey } | undefined => {
    const other = notDueToday(state, now, memberId).find(isThis);
    if (other) {
      if (other.status === 'taken') return { text: `${medLabel(other.med)} (${fmt12(other.time)}) is already taken.`, say: 'taken' };
      if (other.status === 'upcoming') return { text: `${medLabel(other.med)} is scheduled for ${fmt12(other.time)}, not now.`, say: 'notNow' };
      return { text: `${medLabel(other.med)} was due at ${fmt12(other.time)} (${other.status}).`, say: 'notNow' };
    }
    const elsewhere = state.meds.find((m) => m.active && m.memberId !== memberId && isThis({ med: m } as Occurrence));
    if (elsewhere) {
      const who = state.members.find((m) => m.id === elsewhere.memberId)?.name;
      return { text: `This looks like ${medLabel(elsewhere)}, which is ${who}'s medicine.`, say: 'wrong' };
    }
    return undefined;
  };

  // ---- Spoken announcements in the person's language ----
  const member = state.members.find((m) => m.id === memberId);
  const lang: LangCode = member?.language ?? 'en';
  const memberLang = lang;
  const voiceOn = member?.voice !== false;
  const announcement = (r: Result, lang: LangCode = memberLang): string => {
    switch (r.kind) {
      case 'match':
        return (
          matchAnnouncement(lang, r.occs.map((o) => ({ name: medLabel(o.med), qty: o.dose.qty, unit: o.med.unit }))) +
          (r.substitute ? ` ${phrase(lang, 'substitute')}` : '') +
          (r.expiry && expiryStatus(r.expiry) === 'expired' ? ` ${phrase(lang, 'expired')}` : '')
        );
      case 'check':
        return (
          (r.partial
            ? phrase(lang, 'checkName', { name: `${r.occ.med.name} ${spokenStrength(r.occ.med.strength)}` })
            : phrase(lang, 'checkStrength', { strength: spokenStrength(r.occ.med.strength) })) +
          (r.expiry && expiryStatus(r.expiry) === 'expired' ? ` ${phrase(lang, 'expired')}` : '')
        );
      case 'brand':
        return phrase(lang, 'substitute');
      case 'strength':
        return phrase(lang, 'otherStrength');
      case 'nomatch':
        return phrase(lang, r.say);
      case 'unread':
        return phrase(lang, 'unread');
    }
  };
  const [speakStatus, setSpeakStatus] = useState<SpeakStatus>();
  useEffect(() => {
    if (result && voiceOn) say(lang, announcement(result), setSpeakStatus, announcement(result, 'en'));
    if (!result) stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const show = (r: Result) => {
    // The strip's printed expiry, when this read's photo text has one (lastRead is cleared between reads).
    if ((r.kind === 'match' || r.kind === 'check') && lastRead.current.lines.length) {
      const ym = parseExpiry(lastRead.current.lines.join('\n'));
      if (ym) r = { ...r, expiry: ym };
    }
    if (r.kind === 'nomatch') lastRead.current.reason = [r.reason, r.detail ?? r.tip].filter(Boolean).join(' — ');
    if (r.kind === 'unread') lastRead.current.reason = [`${r.diag.issue}: ${r.diag.title}`, r.detail].filter(Boolean).join(' — ');
    setResult(r);
    feedback(r.kind === 'match');
  };

  const onBarcode = ({ data }: BarcodeScanningResult) => {
    if (result || busy || !due.length) return;
    forgetRead(); // a barcode result has no photo text
    const t0 = Date.now();
    if (data === lastCode.current.code && t0 - lastCode.current.at < 3000) return;
    lastCode.current = { code: data, at: t0 };
    const hits = due.filter((o) => matchBarcode(data, o.med));
    if (hits.length) return show({ kind: 'match', occs: hits, method: 'barcode' });
    const why = explainMiss((o) => matchBarcode(data, o.med));
    // An unknown barcode says nothing about the medicine: no verdict, read the printed name instead.
    if (!why) return show({ kind: 'nomatch', reason: "This barcode isn't linked to a medicine yet. That doesn't mean it's wrong — press Read strip name to read the printed name.", code: data, say: 'unread', weak: true });
    show({ kind: 'nomatch', reason: why.text, code: data, say: why.say });
  };

  const checkText = (text: string, method: LogMethod, look?: LookVerdict) => {
    // Every medicine in the household, to spot a strip that is really something else.
    const household = state.meds.filter((m) => m.active);
    const checked = due.map((o) => ({ o, d: matchDetail(text, o.med, household) }));
    const hits = checked.filter((x) => x.d.level === 'match');
    if (hits.length) return show({ kind: 'match', occs: hits.map((x) => x.o), method });
    const subs = checked.filter((x) => x.d.level === 'substitute');
    // Another brand of exactly the same medicine, seen for the first time: a person confirms once (spec 17).
    if (subs.length) return show({ kind: 'brand', occ: subs[0].o, method, via: subs[0].d.via ?? '', askDoctor: subs[0].d.askDoctor });
    const other = checked.find((x) => x.d.level === 'otherStrength');
    if (other) return show({ kind: 'strength', occ: other.o, found: other.d.foundStrengths ?? [], detail: text });
    // The strip looks like a different medicine than the one due: say what it looks like.
    const conflict = checked.find((x) => x.d.level === 'conflict');
    if (conflict) {
      return show({
        kind: 'nomatch',
        reason: `This looks like ${conflict.d.looksLike}, not ${medLabel(conflict.o.med)}. Don't take it — check the strip.`,
        detail: text.replace(/\s+/g, ' ').trim().slice(0, 90),
        say: 'wrong',
      });
    }
    // A strip a person taught earlier (by what was printed on it) — unless it plainly says something else.
    const learned = bestLearned(text.split('\n'), due.map((o) => o.med));
    const learnedOcc = learned && due.find((o) => o.med.id === learned.medId);
    if (learnedOcc && !findConflict(text, learnedOcc.med, household)) return show({ kind: 'match', occs: [learnedOcc], method, learned: true });
    const nameOnly = checked.find((x) => x.d.level === 'nameOnly');
    if (nameOnly) return show({ kind: 'check', occ: nameOnly.o, method, note: nameOnly.d.note });
    // Worn or cut strip: decide among the household's own medicines from fragments ("…LOPIL… 75"), spec 15.
    // Being due is not part of the decision; it only decides what the result says.
    const hh = householdMatch(text, household, method === 'text' ? scanHints() : []);
    if (hh.kind === 'sure' || hh.kind === 'likely') {
      // A fragment match is only a guess at which of the household's medicines this is. If the strip also shows
      // something that medicine doesn't contain (Pantoprazole + Domperidone for Pan), it is a different medicine:
      // say so, rather than "Pan is already taken" or a green.
      const hhMed = household.find((m) => m.id === hh.medId);
      const looks = hhMed && findConflict(text, hhMed, household);
      if (hhMed && looks) {
        return show({
          kind: 'nomatch',
          reason: `This looks like ${looks}, not ${medLabel(hhMed)}. Don't take it — check the strip.`,
          detail: text.replace(/\s+/g, ' ').trim().slice(0, 90),
          say: 'wrong',
        });
      }
      const occ = due.find((o) => o.med.id === hh.medId);
      if (occ) return hh.kind === 'sure' ? show({ kind: 'match', occs: [occ], method }) : show({ kind: 'check', occ, method, partial: true });
      // Only a sure read may say "already taken", "not now" or "someone else's medicine".
      if (hh.kind === 'likely') return show({ kind: 'unread', diag: diagnoseScan(text, household, { partialOf: hhMed ? medLabel(hhMed) : undefined }), detail: text.replace(/\s+/g, ' ').trim().slice(0, 90) });
      const notNow = explainMiss((o) => o.med.id === hh.medId);
      if (notNow) return show({ kind: 'nomatch', reason: notNow.text, detail: text.replace(/\s+/g, ' ').trim().slice(0, 90), say: notNow.say });
    }
    // Look (spec 15): the strip looks like one of the household's saved strips. Only when the text read doesn't
    // point elsewhere: nothing recognisable was read, or the look picks one of the medicines the fragments fit.
    // Look can lift a weak read to amber ("check the name"); never to green, never to "wrong medicine".
    if (look?.kind === 'look') {
      const lookMed = household.find((m) => m.id === look.medId);
      const fits = hh.kind === 'unsure' ? hh.candidates.some((c) => c.medId === look.medId) : !readsAsMedicine(text, household);
      if (lookMed && fits) {
        const occ = due.find((o) => o.med.id === look.medId);
        if (occ) return show({ kind: 'check', occ, method, partial: true, byLook: true });
        return show({ kind: 'unread', diag: diagnoseScan(text, household, { partialOf: medLabel(lookMed) }), detail: text.replace(/\s+/g, ' ').trim().slice(0, 90) || undefined });
      }
    }
    if (hh.kind === 'unsure') {
      // Two of the household's medicines fit what was read: a weak read, not a wrong medicine.
      const fits = [...new Set(hh.candidates.slice(0, 3).map((c) => household.find((m) => m.id === c.medId)).filter((m) => m !== undefined).map((m) => medLabel(m!)))];
      return show({ kind: 'unread', diag: diagnoseScan(text, household, { twoFit: fits }), detail: text.replace(/\s+/g, ' ').trim().slice(0, 90) });
    }
    const why = explainMiss((o) => ['match', 'substitute'].includes(matchDetail(text, o.med, household).level));
    // Nothing recognisable was read — no known name, no contents: say how to scan again, not "wrong medicine".
    if (!why && !readsAsMedicine(text, household)) {
      return show({ kind: 'unread', diag: diagnoseScan(text, household), detail: text.replace(/\s+/g, ' ').trim().slice(0, 90) || undefined });
    }
    show({
      kind: 'nomatch',
      reason: why?.text ?? 'No medicine due now matches this strip.',
      detail: text.replace(/\s+/g, ' ').trim().slice(0, 90) || undefined,
      tip: text.trim() ? undefined : 'Nothing could be read. Hold the strip closer, and tilt it away from lights.',
      say: why?.say ?? 'wrong',
    });
  };

  const readStrip = async () => {
    if (!camera.current || busy) return;
    forgetRead(); // a previous unconfirmed scan's photos are kept before this one replaces them
    setBusy(true);
    startScanStats();
    const photos: string[] = [];
    try {
      const cam = camera.current;
      const take = async () => {
        const uri = (await cam.takePictureAsync({ quality: 0.9, shutterSound: false })).uri;
        photos.push(uri);
        return uri;
      };
      setProgress('Reading the strip…');
      const household = state.meds.filter((m) => m.active);
      setHouseholdWords(householdWords(household));
      const first = await take();
      // How the strip looks, compared with its saved photos, alongside the reading (iPhone; null elsewhere).
      const looking = lookAt(first, household).catch(() => null);
      let text = (await readLinesAnyOrientation(first)).map((l) => l.text).join('\n');
      const settled = () =>
        due.some((o) => ['match', 'substitute', 'conflict'].includes(matchDetail(text, o.med, state.meds).level)) ||
        householdMatch(text, household).kind === 'sure';
      // Nothing matched? First a second look at the same photo (iPhone: the other reader, and the household's
      // words as a hint), then — glare may be hiding letters — two more photos at slightly different angles.
      if (!settled()) {
        setProgress('Looking again…');
        const again = await readSecondLook([...photos]);
        if (again.length) text += '\n' + again.map((l) => l.text).join('\n');
      }
      if (!settled()) {
        const more = await readBurst(take, { shots: 2, onShot: (n) => setProgress(`Taking another photo (${n} of 2) — tilt the strip a little`) });
        text += '\n' + more.map((l) => l.text).join('\n');
      }
      const look = await looking;
      lastRead.current = { lines: text.split('\n'), photos, readBy: scanReaderLabel(), detector: scanDetectorLabel(), look: lookLabel(look, household) };
      checkText(text, 'text', look?.verdict);
    } catch (e) {
      lastRead.current = { lines: [], photos };
      // A reader failure is a scan problem, never a verdict on the medicine.
      const notBuilt = String(e).includes('linked');
      show({
        kind: 'unread',
        diag: {
          issue: 'nothing',
          title: notBuilt ? "This version can't read printed names" : 'The photo could not be read',
          why: notBuilt ? 'Reading printed names is not built into this version of the app. Barcodes still work.' : 'Something went wrong while reading the photo.',
          tips: notBuilt ? ['Scan the barcode on the box or strip instead.'] : ['Try again, holding the strip steady about a hand-width away.', 'Tilt the strip a little away from lights.'],
        },
      });
    } finally {
      setBusy(false);
    }
  };

  const keepPhotos = (o: Occurrence, how: 'dose-check' | 'taught') => {
    const { lines, photos, kept } = lastRead.current;
    if (keepsTraining(state.settings) && photos.length && !kept) {
      lastRead.current.kept = true; // teaching then confirming the same scan must not save it twice
      saveTrainingPhotos(photos, { name: o.med.name, strength: o.med.strength }, how, lines.join('\n')).catch(() => {});
    }
  };

  const confirm = (occs: Occurrence[], method: LogMethod, expiry?: string) => {
    record(occs, 'taken', method);
    // A strip read by camera and confirmed as one medicine: remember it, so it's recognised more easily next time.
    if (occs.length === 1 && lastRead.current.lines.length) {
      teach(occs[0].med.id, lastRead.current.lines);
      // Strips wear slowly: today's photo is the best picture for tomorrow's scan (spec 15). Oldest of six goes.
      const prof = occs[0].med.profile;
      const photo = lastRead.current.photos[0];
      if (prof && photo) withNewReference(prof, photo).then((p) => setProfile(occs[0].med.id, p)).catch(() => {});
      if (expiry) setExpiry(occs[0].med.id, expiry);
      keepPhotos(occs[0], 'dose-check');
    } else if (occs.length > 1) keepUnconfirmed('Matched several medicines at once; which one the strip is was not confirmed.');
    lastRead.current = { lines: [], photos: [] };
    setResult(null);
    setTyped('');
  };

  const teachAs = (o: Occurrence) =>
    Alert.alert(
      `Teach: this strip is ${medLabel(o.med)}?`,
      `Only do this after checking the strip yourself — name and strength ${o.med.strength}. Next time the app will recognise this strip even if the name is hard to read.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, teach it',
          onPress: () => {
            teach(o.med.id, lastRead.current.lines);
            keepPhotos(o, 'taught');
            show({ kind: 'match', occs: [o], method: 'manual', learned: true });
          },
        },
      ],
    );

  /** Which text reader (and, once added, the region detector) read this scan — small print under the result. */
  const ReadBy = () =>
    state.settings.showScanDetails && lastRead.current.readBy ? (
      <Text style={{ color: '#fff', fontSize: 14, marginTop: 10 }}>
        Read by {lastRead.current.readBy} · strip area finder: {lastRead.current.detector}
        {lastRead.current.look ? ` · ${lastRead.current.look}` : ''}
      </Text>
    ) : null;

  const TeachChips = () =>
    lastRead.current.lines.length ? (
        <More title="Helper: it is the right medicine" color="#fff">
        <Text style={{ color: '#fff', fontSize: 16 }}>Checked the strip yourself? Tap its name so the app knows it next time:</Text>
        <View style={s.wrap}>
          {due.map((o) => (
            <Pressable accessibilityRole="button"
              key={o.key}
              onPress={() => teachAs(o)}
              style={whiteChip}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{medLabel(o.med)}</Text>
            </Pressable>
          ))}
        </View>
        </More>
    ) : null;

  if (!state.meds.length)
    return (
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Empty title="No medicines yet" body="Add a medicine first, then scan its strip here at dose time." />
        <Button big title="Add a medicine" onPress={() => router.push('/add')} />
        <CollectCard />
      </ScrollView>
    );

  const todayOccs = occurrencesForDate(state, dateKey(now), now, memberId);
  const next = todayOccs.find((o) => o.status === 'upcoming');
  // Everything at the next time (several medicines are often due together); tomorrow's first time if today is done.
  const tomorrowOccs = next ? [] : occurrencesForDate(state, dateKey(addDays(now, 1)), now, memberId);
  const nextIsTomorrow = !next && tomorrowOccs.length > 0;
  const nextGroup = next ? todayOccs.filter((o) => o.status === 'upcoming' && o.time === next.time) : tomorrowOccs.filter((o) => o.time === tomorrowOccs[0]?.time);
  // Several medicines at the same time: show which one this is and what is still to take.
  const matched = result?.kind === 'match' ? result.occs : [];
  const stillToTake = due.filter((o) => !matched.some((m) => m.key === o.key));
  const sameTime = matched.length ? todayOccs.filter((o) => matched.some((m) => m.time === o.time)) : [];
  const takenAtTime = sameTime.filter((o) => o.status === 'taken' || o.status === 'skipped').length;
  const atTimeProgress =
    sameTime.length > 1 ? { label: [...new Set(matched.map((m) => fmt12(m.time)))].join(', '), n: Math.min(sameTime.length, takenAtTime + matched.length), total: sameTime.length } : null;
  const doneNow = todayOccs.filter((o) => o.status === 'taken' && Math.abs(now.getTime() - new Date(o.log!.at).getTime()) < 3 * 3600e3);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <MemberPicker value={memberId} onChange={setMemberId} />

      {!due.length ? (
        // Nothing due: a calm screen — where things stand, what comes next (all medicines at that time), one suggestion.
        <View style={{ marginTop: 16 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: doneNow.length ? t.okFill : t.muted, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={doneNow.length ? 'checkmark' : 'time-outline'} size={36} color={doneNow.length ? '#fff' : t.text} />
          </View>
          <Text maxFontSizeMultiplier={1.4} style={{ color: t.text, fontSize: 30, fontWeight: '700', letterSpacing: -0.3, marginTop: 16 }}>
            {doneNow.length ? 'All done for now' : 'Nothing to take right now'}
          </Text>

          {nextGroup.length > 0 ? (
            <Card style={{ marginTop: 20 }}>
              <Text style={{ color: t.sub, fontSize: 17, fontWeight: '600' }}>
                Next · {nextIsTomorrow ? 'tomorrow ' : ''}
                {fmt12(nextGroup[0].time)}
              </Text>
              {nextGroup.map((o) => (
                <View key={o.key} style={{ marginTop: 10 }}>
                  <Text style={{ color: t.text, fontSize: 21, fontWeight: '700' }}>{medLabel(o.med)}</Text>
                  <Text style={{ color: t.sub, fontSize: 16, marginTop: 1 }}>
                    {qtyLabel(o.dose.qty, o.med.unit)} · {describeTiming(o.dose)}
                  </Text>
                </View>
              ))}
            </Card>
          ) : (
            <Text style={{ color: t.sub, fontSize: 18, marginTop: 8 }}>No more medicines today.</Text>
          )}

          {/* One suggestion at most: check strips that haven't been tried yet, so the real scan goes smoothly. */}
          {ready.total > 0 && ready.ready < ready.total ? (
            <Button
              big
              title={nextGroup.length && !nextIsTomorrow ? `Check the strips for ${fmt12(nextGroup[0].time)}` : 'Check the next strips'}
              onPress={() => router.push('/test-scan')}
              style={{ marginTop: 20 }}
            />
          ) : ready.total > 0 ? (
            <Text style={{ color: t.ok, marginTop: 16, fontSize: 17, fontWeight: '600' }}>✓ The next strips are checked</Text>
          ) : null}
        </View>
      ) : (
        <>
          {/* Due checklist (hidden while a result fills the screen) */}
          {!result && (
          <Card style={{ marginTop: 8, paddingVertical: 12 }}>
            <Text style={{ color: t.sub, fontWeight: '700', fontSize: 16, marginBottom: 6 }}>Due now — scan each one</Text>
            {due.map((o) => (
              <View key={o.key} style={[s.between, { paddingVertical: 4 }]}>
                <Text style={{ color: t.text, fontSize: 18, fontWeight: '700', flex: 1 }}>{medLabel(o.med)}</Text>
                <Text style={{ color: t.sub, fontSize: 16 }}>
                  {qtyLabel(o.dose.qty, o.med.unit)} · {fmt12(o.time)}
                </Text>
              </View>
            ))}
            {doneNow.map((o) => (
              <View key={o.key} style={[s.between, { paddingVertical: 4 }]}>
                <Text style={{ color: t.ok, fontSize: 16, fontWeight: '600', flex: 1, textDecorationLine: 'line-through' }}>{medLabel(o.med)}</Text>
                <Text style={{ color: t.ok }}>✓ taken</Text>
              </View>
            ))}
          </Card>
          )}

          {/* Camera — kept running but folded away while a result shows, so the next scan starts at once */}
          <View style={{ height: result ? 0 : 300, borderRadius: 20, overflow: 'hidden', marginTop: result ? 0 : 12, backgroundColor: '#000' }}>
            {!perm ? null : !perm.granted ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                <Text style={{ color: '#fff', textAlign: 'center', marginBottom: 12 }}>Camera access is needed to scan medicine strips.</Text>
                <Button title="Allow camera" onPress={requestPerm} />
              </View>
            ) : focused ? (
              <CameraView
                ref={camera}
                style={{ flex: 1 }}
                facing="back"
                flash="off"
                enableTorch={torch}
                barcodeScannerSettings={{ barcodeTypes: BARCODES }}
                onBarcodeScanned={result ? undefined : onBarcode}
              />
            ) : null}
            {perm?.granted && focused && (
              <Pressable accessibilityRole="button"
                onPress={() => setTorch((v) => !v)}
                accessibilityLabel={torch ? 'Turn light off' : 'Turn light on'}
                style={{ position: 'absolute', top: 10, right: 10, backgroundColor: '#0008', borderRadius: 26, width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name={torch ? 'flashlight' : 'flashlight-outline'} size={26} color="#fff" />
              </Pressable>
            )}
            {busy && (
              <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0007' }}>
                <ActivityIndicator color="#fff" size="large" />
                <Text style={{ color: '#fff', marginTop: 8, textAlign: 'center', paddingHorizontal: 16 }}>{progress || 'Reading strip…'}</Text>
              </View>
            )}
            {!result && !busy && (
              <View style={{ position: 'absolute', bottom: 10, left: 10, right: 10, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 16, backgroundColor: '#0009', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, overflow: 'hidden' }}>
                  Hold the strip in view, then press the button
                </Text>
              </View>
            )}
          </View>

          {!result && <Button big title="Read strip name" onPress={readStrip} disabled={busy || !perm?.granted} style={{ marginTop: 12 }} />}

          {/* Result */}
          {result?.kind === 'match' && (
            <View style={{ backgroundColor: t.okFill, borderRadius: 24, padding: 24, marginTop: 8, minHeight: 560 }}>
              {atTimeProgress && (
                <View style={{ marginBottom: 18 }}>
                  <Text style={{ color: '#fff', fontSize: 17, fontWeight: '600' }}>
                    {atTimeProgress.label} · medicine {atTimeProgress.n} of {atTimeProgress.total}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                    {Array.from({ length: atTimeProgress.total }, (_, i) => (
                      <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i < atTimeProgress.n ? '#fff' : '#ffffff59' }} />
                    ))}
                  </View>
                </View>
              )}
              <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="checkmark" size={46} color={t.okFill} />
              </View>
              <Text style={{ color: '#fff', fontSize: 22, fontWeight: '600', marginTop: 20 }}>Matches your list</Text>
              {result.expiry && expiryStatus(result.expiry) === 'expired' && (
                <View style={{ backgroundColor: '#7F1D1D', borderRadius: 12, padding: 12, marginTop: 10 }}>
                  <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>This strip expired in {formatExpiry(result.expiry)}.</Text>
                  <Text style={{ color: '#fff', marginTop: 2 }}>Don't take it — use another strip or ask your pharmacist.</Text>
                </View>
              )}
              {result.expiry && expiryStatus(result.expiry) === 'soon' && (
                <Text style={{ color: '#fff', fontSize: 16, marginTop: 6 }}>Strip expires end of {formatExpiry(result.expiry)}.</Text>
              )}
              {result.occs.map((o) => (
                <View key={o.key} style={{ marginTop: 10 }}>
                  <Text maxFontSizeMultiplier={1.4} style={{ color: '#fff', fontSize: 46, lineHeight: 50, fontWeight: '800', letterSpacing: -0.5 }}>Take {qtyLabel(o.dose.qty, o.med.unit)}</Text>
                  <Text style={{ color: '#fff', fontSize: 22, fontWeight: '600', marginTop: 4 }}>
                    {medLabel(o.med)}
                    {lang !== 'en' ? `  ·  ${amountText(lang, o.dose.qty, o.med.unit)}` : ''}
                  </Text>
                  {o.dose.qty !== 1 && o.med.unit === 'tablet' && (
                    <Text style={{ color: '#fff', fontSize: 16, marginTop: 2 }}>
                      {o.dose.qty < 1 ? 'Break the tablet along the line.' : 'More than one tablet — count carefully.'}
                    </Text>
                  )}
                  {o.med.notes ? <Text style={{ color: '#fff', fontSize: 16, marginTop: 4 }}>{o.med.notes}</Text> : null}
                </View>
              ))}
              {/* One reminder line; the two special cases replace it rather than adding to it. */}
              {result.substitute || result.learned ? (
                <View style={{ backgroundColor: '#0003', borderRadius: 10, padding: 10, marginTop: 12 }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                    {result.substitute ? `Different brand: ${result.substitute}` : 'Known from a strip you showed the app before.'}
                  </Text>
                  <Text style={{ color: '#fff', fontSize: 16 }}>Check the name and strength on the strip before taking.</Text>
                </View>
              ) : (
                <Text style={{ color: '#fff', marginTop: 10, fontSize: 16 }}>Check the name on the strip too.</Text>
              )}
              <View style={{ flex: 1, minHeight: 16 }} />
              {stillToTake.length > 0 && (
                <Text style={{ color: '#fff', fontSize: 18, marginTop: 12 }}>
                  Still to take now: <Text style={{ fontWeight: '800' }}>{stillToTake.map((o) => medLabel(o.med)).join(', ')}</Text>
                </Text>
              )}
              <Button big title={stillToTake.length ? 'I took it — next strip' : 'I took it'} kind="light" onPress={() => confirm(result.occs, result.method, result.expiry)} style={{ marginTop: 16 }} />
              <Button title="Not now" kind="ghost" onColor onPress={dismiss} style={{ marginTop: 10 }} />
              <ReadBy />
            </View>
          )}

          {result?.kind === 'check' && (
            <View style={{ backgroundColor: t.warnFill, borderRadius: 24, padding: 24, marginTop: 8, minHeight: 560 }}>
              <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>{result.note ? '⚠ Check with the pharmacist' : result.partial ? '⚠ Check the name' : '⚠ Check the strength'}</Text>
              {result.expiry && expiryStatus(result.expiry) === 'expired' && (
                <View style={{ backgroundColor: '#7F1D1D', borderRadius: 12, padding: 12, marginTop: 10 }}>
                  <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>This strip expired in {formatExpiry(result.expiry)}.</Text>
                  <Text style={{ color: '#fff', marginTop: 2 }}>Don't take it — use another strip or ask your pharmacist.</Text>
                </View>
              )}
              <Text style={{ color: '#fff', fontSize: 17, marginTop: 6 }}>
                {result.note
                  ? result.note
                  : result.byLook
                  ? `The name couldn't be read, but the strip looks like your ${result.occ.med.name}.`
                  : result.partial
                  ? `Only part of the name could be read. It looks like ${result.occ.med.name}.`
                  : `The name matches ${result.occ.med.name}, but the strength couldn't be read (torn or shiny).`}
              </Text>
              <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900', marginTop: 10 }}>
                Strip must say {result.partial ? `${result.occ.med.name} ` : ''}{spokenStrength(result.occ.med.strength)}
              </Text>
              <Text style={{ color: '#fff', fontSize: 17, marginTop: 4 }}>Then take {qtyLabel(result.occ.dose.qty, result.occ.med.unit)}.</Text>
              <Button
                big
                title={`It says ${spokenStrength(result.occ.med.strength)} — I took it`}
                kind="light"
                onPress={() => confirm([result.occ], 'manual', result.expiry)}
                style={{ marginTop: 14 }}
              />
              <Button title="Scan again" kind="ghost" onColor onPress={dismiss} style={{ marginTop: 8 }} />
              <ReadBy />
            </View>
          )}

          {result?.kind === 'brand' && (() => {
            const usual = { name: result.occ.med.name, strength: result.occ.med.strength, aliases: result.occ.med.aliases, unit: result.occ.med.unit };
            const parts = splitName(result.via);
            const strip = { name: parts.brand, strength: parts.strength || usual.strength, unit: result.occ.med.unit };
            const card = substituteCard(exchangeable(usual, strip), usual, strip, member?.name);
            const accept = () => {
              addOtherName(result.occ.med.id, result.via);
              show({ kind: 'match', occs: [result.occ], method: result.method });
            };
            const Row = ({ label, name, generic }: { label: string; name: string; generic: string }) => (
              <View style={{ backgroundColor: '#0002', borderRadius: 14, padding: 14, marginTop: 10 }}>
                <Text style={{ color: '#fff', fontSize: 16 }}>{label}</Text>
                <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800' }}>{name}</Text>
                <Text style={{ color: '#fff', fontSize: 17 }}>{generic}</Text>
              </View>
            );
            return (
              <View style={{ backgroundColor: t.warnFill, borderRadius: 24, padding: 24, marginTop: 8, minHeight: 560 }}>
                <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800' }}>{card.title}</Text>
                <Row label="This strip" name={card.strip.name} generic={card.strip.generic} />
                <Row label="Usual" name={card.usual.name} generic={card.usual.generic} />
                {card.note ? (
                  <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 12 }}>{card.note}</Text>
                ) : (
                  <Text style={{ color: '#fff', fontSize: 17, marginTop: 12 }}>Same medicine and strength. Only the maker is different.</Text>
                )}
                <View style={{ flex: 1, minHeight: 16 }} />
                <Button big title={card.yes} kind="light" onPress={accept} style={{ marginTop: 14 }} />
                <Button title={card.no} kind="ghost" onColor onPress={dismiss} style={{ marginTop: 8 }} />
                <ReadBy />
              </View>
            );
          })()}

          {result?.kind === 'strength' && (
            <View style={{ backgroundColor: t.badFill, borderRadius: 24, padding: 24, marginTop: 8, minHeight: 560 }}>
              <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>✋ Different strength — don't take</Text>
              <Text style={{ color: '#fff', fontSize: 17, marginTop: 6 }}>
                This strip says {result.found.map((f) => `${f} mg`).join(' / ')}.
              </Text>
              <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 4 }}>
                You need {result.occ.med.name} {spokenStrength(result.occ.med.strength) || result.occ.med.strength}.
              </Text>
              <Text style={{ color: '#fff', fontSize: 16, marginTop: 6 }}>Ask the pharmacist before using a different strength.</Text>
              <Button title="Scan next" kind="light" big onPress={dismiss} style={{ marginTop: 14 }} />
            </View>
          )}

          {result?.kind === 'unread' && (
            <View style={{ backgroundColor: t.warnFill, borderRadius: 24, padding: 24, marginTop: 8, minHeight: 560 }}>
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700', opacity: 0.9 }}>SCAN PROBLEM — NOT A RESULT</Text>
              <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 4 }}>⚠ {result.diag.title}</Text>
              <Text style={{ color: '#fff', fontSize: 16, marginTop: 6 }}>{result.diag.why} This says nothing about whether it is the right medicine. Scan again:</Text>
              {result.diag.tips.map((tip) => (
                <Text key={tip} style={{ color: '#fff', fontSize: 16, marginTop: 6 }}>• {tip}</Text>
              ))}
              {result.detail && state.settings.showScanDetails ? <Text style={{ color: '#fff', marginTop: 6, fontStyle: 'italic' }}>Read: “{result.detail}”</Text> : null}
              <ReadBy />
              <Button title="Scan again" kind="light" big onPress={dismiss} style={{ marginTop: 14 }} />
              <TeachChips />
            </View>
          )}

          {result?.kind === 'nomatch' && (
            <View style={{ backgroundColor: result.weak ? t.warnFill : t.badFill, borderRadius: 24, padding: 24, marginTop: 8, minHeight: 560 }}>
              <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800' }}>{result.weak ? '⚠ Barcode not known yet' : '✗ No match'}</Text>
              <Text style={{ color: '#fff', fontSize: 16, marginTop: 6 }}>{result.reason}</Text>
              {result.tip ? <Text style={{ color: '#fff', fontSize: 16, marginTop: 6 }}>{result.tip}</Text> : null}
              {/* The raw text read is for helpers only. */}
              {result.detail && state.settings.showScanDetails ? <Text style={{ color: '#fff', marginTop: 6, fontStyle: 'italic' }}>Read: “{result.detail}”</Text> : null}
              <ReadBy />
              <Button title="Scan next" kind="light" big onPress={dismiss} style={{ marginTop: 14 }} />
              {!result.code && <TeachChips />}
              {result.code && (
                <More title="Helper: it is the right medicine" color="#fff">
                  <Text style={{ color: '#fff', fontSize: 16 }}>Checked the strip yourself? Tap its name so this barcode is known next time:</Text>
                  <View style={s.wrap}>
                    {due.map((o) => (
                      <Pressable accessibilityRole="button"
                        key={o.key}
                        onPress={() => {
                          linkBarcode(o.med.id, result.code!);
                          show({ kind: 'match', occs: [o], method: 'barcode' });
                        }}
                        style={whiteChip}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{medLabel(o.med)}</Text>
                      </Pressable>
                    ))}
                  </View>
                </More>
              )}
            </View>
          )}

          {result && voiceOn && (
            <Pressable accessibilityRole="button" onPress={() => voiceOn && say(lang, announcement(result), setSpeakStatus, announcement(result, 'en'))} style={{ alignSelf: 'center', marginTop: 8, minHeight: 44, flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="volume-high-outline" size={24} color={t.text} />
              {/* Why a voice is missing is explained on the family member's screen, not here. */}
              <Text style={{ color: t.text, fontWeight: '700', fontSize: 17, marginLeft: 6 }}>Say it again</Text>
            </Pressable>
          )}

          {/* Fallback */}
          {!result && (
            <More title="Can't scan? Type the name instead">
              <View style={[s.row, { gap: 8 }]}>
                <Field value={typed} onChangeText={setTyped} placeholder="e.g. Dolo 650" autoCapitalize="characters" style={{ flex: 1 }} />
                <Button title="Check" onPress={() => typed.trim() && ((lastRead.current = { lines: [], photos: [] }), checkText(typed, 'manual'))} />
              </View>
            </More>
          )}
        </>
      )}
    </ScrollView>
  );
}
