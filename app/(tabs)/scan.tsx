import { BarcodeScanningResult, BarcodeType, CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect, useIsFocused } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { MemberPicker } from '../../src/components.tsx';
import { findConflict, matchBarcode, matchDetail, matchText } from '../../src/match.ts';
import { amountText, matchAnnouncement, phrase, spokenStrength, type LangCode, type PhraseKey } from '../../src/phrases.ts';
import { say, stopSpeaking, type SpeakStatus } from '../../src/speech.ts';
import { readBurst, readLinesAnyOrientation, scanDetectorLabel, scanReaderLabel, startScanStats } from '../../src/ocr.ts';
import { loadRegionModel, setRegionDetectorEnabled } from '../../src/regionModel.ts';
import { readinessSummary, upcomingReadiness, type TestRecords } from '../../src/testScan.ts';
import { loadTestRecords } from '../../src/testScanStore.ts';
import { bestLearned } from '../../src/learn.ts';
import { saveTrainingPhotos, saveUnlabelledPhotos } from '../../src/training.ts';
import { Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dueNow, medLabel, notDueToday, occurrencesForDate, qtyLabel } from '../../src/schedule.ts';
import { useStore } from '../../src/store.tsx';
import { dateKey, fmt12 } from '../../src/time.ts';
import { expiryStatus, formatExpiry, parseExpiry } from '../../src/expiry.ts';
import type { LogMethod, Occurrence } from '../../src/types.ts';
import { Button, Card, Empty, Field, s, useTheme } from '../../src/ui.tsx';

const BARCODES: BarcodeType[] = ['qr', 'datamatrix', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'pdf417', 'itf14'];

type Result =
  | { kind: 'match'; occs: Occurrence[]; method: LogMethod; substitute?: string; learned?: boolean; expiry?: string } // green
  | { kind: 'check'; occ: Occurrence; method: LogMethod; expiry?: string } // amber: name matches, strength unreadable
  | { kind: 'strength'; occ: Occurrence; found: string[]; detail: string } // stop: different strength printed
  | { kind: 'nomatch'; reason: string; detail?: string; code?: string; say: PhraseKey }; // red

export default function Scan() {
  const t = useTheme();
  const focused = useIsFocused();
  const { state, now, record, linkBarcode, teach, setExpiry } = useStore();
  const [perm, requestPerm] = useCameraPermissions();
  const camera = useRef<CameraView>(null);

  // Default to the first family member who has something due.
  const firstDue = useMemo(() => state.members.find((m) => dueNow(state, now, m.id).length)?.id, [state, now]);
  const [memberId, setMemberId] = useState<string | undefined>(firstDue ?? state.members[0]?.id);
  useEffect(() => {
    if (!memberId || !state.members.some((m) => m.id === memberId)) setMemberId(firstDue ?? state.members[0]?.id);
  }, [firstDue, memberId, state.members]);

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
  const lastRead = useRef<{ lines: string[]; photos: string[]; kept?: boolean; reason?: string; readBy?: string; detector?: string }>({ lines: [], photos: [] });
  useEffect(() => {
    setRegionDetectorEnabled(state.settings.regionDetector !== false);
    loadRegionModel(); // load the model before the first scan, not during it
  }, [state.settings.regionDetector]);
  const collectTraining = useRef(false);
  collectTraining.current = !!state.settings.collectTraining;

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
          phrase(lang, 'checkStrength', { strength: spokenStrength(r.occ.med.strength) }) +
          (r.expiry && expiryStatus(r.expiry) === 'expired' ? ` ${phrase(lang, 'expired')}` : '')
        );
      case 'strength':
        return phrase(lang, 'otherStrength');
      case 'nomatch':
        return phrase(lang, r.say);
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
    if (r.kind === 'nomatch') lastRead.current.reason = [r.reason, r.detail].filter(Boolean).join(' — ');
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
    show({ kind: 'nomatch', reason: why?.text ?? 'This code is not linked to any medicine due now.', code: data, say: why?.say ?? 'wrong' });
  };

  const checkText = (text: string, method: LogMethod) => {
    // Every medicine in the household, to spot a strip that is really something else.
    const household = state.meds.filter((m) => m.active);
    const checked = due.map((o) => ({ o, d: matchDetail(text, o.med, household) }));
    const hits = checked.filter((x) => x.d.level === 'match');
    if (hits.length) return show({ kind: 'match', occs: hits.map((x) => x.o), method });
    const subs = checked.filter((x) => x.d.level === 'substitute');
    if (subs.length) return show({ kind: 'match', occs: subs.map((x) => x.o), method, substitute: subs[0].d.via });
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
    if (nameOnly) return show({ kind: 'check', occ: nameOnly.o, method });
    const why = explainMiss((o) => ['match', 'substitute'].includes(matchDetail(text, o.med, household).level));
    show({
      kind: 'nomatch',
      reason: why?.text ?? 'No medicine due now matches this strip.',
      detail: text.replace(/\s+/g, ' ').trim().slice(0, 90) || 'No readable text found — move closer, and tilt the strip away from lights to cut the shine.',
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
      let text = (await readLinesAnyOrientation(await take())).map((l) => l.text).join('\n');
      // Nothing matched? Glare may be hiding letters — take two more photos at slightly different angles.
      if (!due.some((o) => ['match', 'substitute', 'conflict'].includes(matchDetail(text, o.med, state.meds).level))) {
        const more = await readBurst(take, { shots: 2, onShot: (n) => setProgress(`Shine check ${n}/2 — tilt the strip a little…`) });
        text += '\n' + more.map((l) => l.text).join('\n');
      }
      lastRead.current = { lines: text.split('\n'), photos, readBy: scanReaderLabel(), detector: scanDetectorLabel() };
      checkText(text, 'text');
    } catch (e) {
      lastRead.current = { lines: [], photos };
      show({
        kind: 'nomatch',
        reason: 'Could not read text.',
        detail: String(e).includes('linked') ? 'Text reading needs the installed app build (not Expo Go). Barcode scanning still works.' : 'Try again, closer and with less shine.',
        say: 'wrong',
      });
    } finally {
      setBusy(false);
    }
  };

  const keepPhotos = (o: Occurrence, how: 'dose-check' | 'taught') => {
    const { lines, photos, kept } = lastRead.current;
    if (state.settings.collectTraining && photos.length && !kept) {
      lastRead.current.kept = true; // teaching then confirming the same scan must not save it twice
      saveTrainingPhotos(photos, { name: o.med.name, strength: o.med.strength }, how, lines.join('\n')).catch(() => {});
    }
  };

  const confirm = (occs: Occurrence[], method: LogMethod, expiry?: string) => {
    record(occs, 'taken', method);
    // A strip read by camera and confirmed as one medicine: remember it, so it's recognised more easily next time.
    if (occs.length === 1 && lastRead.current.lines.length) {
      teach(occs[0].med.id, lastRead.current.lines);
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
    lastRead.current.readBy ? (
      <Text style={{ color: '#fffb', fontSize: 12, marginTop: 10 }}>
        Read by {lastRead.current.readBy} · region detector: {lastRead.current.detector}
      </Text>
    ) : null;

  const TeachChips = () =>
    lastRead.current.lines.length ? (
      <>
        <Text style={{ color: '#fff', marginTop: 14, fontWeight: '600' }}>Is it one of these? Teach the app this strip:</Text>
        <View style={[s.wrap, { marginTop: 8 }]}>
          {due.map((o) => (
            <Pressable
              key={o.key}
              onPress={() => teachAs(o)}
              style={{ backgroundColor: '#fff3', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, marginRight: 8, marginBottom: 8 }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>{medLabel(o.med)}</Text>
            </Pressable>
          ))}
        </View>
      </>
    ) : null;

  if (!state.meds.length) return <Empty title="No medicines scheduled" body="Add medicines in the Schedule tab first." />;

  const todayOccs = occurrencesForDate(state, dateKey(now), now, memberId);
  const next = todayOccs.find((o) => o.status === 'upcoming');
  const doneNow = todayOccs.filter((o) => o.status === 'taken' && Math.abs(now.getTime() - new Date(o.log!.at).getTime()) < 3 * 3600e3);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <MemberPicker value={memberId} onChange={setMemberId} />

      {!due.length ? (
        <Card style={{ marginTop: 8 }}>
          <Text style={[s.h2, { color: t.ok }]}>{doneNow.length ? '✓ All due medicines taken' : 'Nothing due right now'}</Text>
          <Text style={{ color: t.sub, marginTop: 6 }}>
            {next ? `Next: ${medLabel(next.med)} at ${fmt12(next.time)}` : 'No more doses today.'}
          </Text>
          {ready.total > 0 && (
            <Text style={{ color: ready.ready === ready.total ? t.ok : t.sub, marginTop: 6 }}>
              {ready.ready === ready.total
                ? `✓ All ${ready.total} medicines for the next 24 hours tested`
                : `${ready.ready} of ${ready.total} medicines for the next 24 hours tested`}
            </Text>
          )}
          <Button title="Test scan (nothing is logged)" kind="secondary" onPress={() => router.push('/test-scan')} style={{ marginTop: 12 }} />
        </Card>
      ) : (
        <>
          {/* Due checklist */}
          <Card style={{ marginTop: 8, paddingVertical: 12 }}>
            <Text style={{ color: t.sub, fontWeight: '700', marginBottom: 6 }}>DUE NOW — scan each one</Text>
            {due.map((o) => (
              <View key={o.key} style={[s.between, { paddingVertical: 4 }]}>
                <Text style={{ color: t.text, fontSize: 16, fontWeight: '600', flex: 1 }}>{medLabel(o.med)}</Text>
                <Text style={{ color: t.sub }}>
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

          {/* Camera */}
          <View style={{ height: 300, borderRadius: 18, overflow: 'hidden', marginTop: 12, backgroundColor: '#000' }}>
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
                autofocus="on"
                flash="off"
                enableTorch={torch}
                barcodeScannerSettings={{ barcodeTypes: BARCODES }}
                onBarcodeScanned={result ? undefined : onBarcode}
              />
            ) : null}
            {perm?.granted && focused && (
              <Pressable
                onPress={() => setTorch((v) => !v)}
                accessibilityLabel={torch ? 'Turn light off' : 'Turn light on'}
                style={{ position: 'absolute', top: 10, right: 10, backgroundColor: '#0008', borderRadius: 20, padding: 8 }}
              >
                <Ionicons name={torch ? 'flashlight' : 'flashlight-outline'} size={22} color="#fff" />
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
                <Text style={{ color: '#fff', backgroundColor: '#0008', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, overflow: 'hidden' }}>
                  Barcodes scan automatically · tap below for printed names
                </Text>
              </View>
            )}
          </View>

          {!result && <Button big title="Read strip name" onPress={readStrip} disabled={busy || !perm?.granted} style={{ marginTop: 12 }} />}

          {/* Result */}
          {result && (
            <Pressable onPress={() => voiceOn && say(lang, announcement(result), setSpeakStatus, announcement(result, 'en'))} style={{ alignSelf: 'flex-end', marginTop: 10, flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="volume-high-outline" size={20} color={t.brand} />
              <Text style={{ color: t.brand, fontWeight: '700', marginLeft: 6 }}>
                {!voiceOn ? 'Voice is off for this person' : speakStatus === 'fallback' ? 'Said in English — no voice for this language on this phone (see family member settings)' : speakStatus === 'noVoice' ? 'No voice for this language on this phone — see family member settings' : 'Say it again'}
              </Text>
            </Pressable>
          )}

          {result?.kind === 'match' && (
            <View style={{ backgroundColor: t.ok, borderRadius: 18, padding: 18, marginTop: 8 }}>
              <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>✓ Correct medicine</Text>
              {result.expiry && expiryStatus(result.expiry) === 'expired' && (
                <View style={{ backgroundColor: t.bad, borderRadius: 12, padding: 12, marginTop: 10 }}>
                  <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>This strip expired in {formatExpiry(result.expiry)}.</Text>
                  <Text style={{ color: '#fff', marginTop: 2 }}>Don't take it — use another strip or ask your pharmacist.</Text>
                </View>
              )}
              {result.expiry && expiryStatus(result.expiry) === 'soon' && (
                <Text style={{ color: '#fffd', marginTop: 6 }}>Strip expires end of {formatExpiry(result.expiry)}.</Text>
              )}
              {result.occs.map((o) => (
                <View key={o.key} style={{ marginTop: 10 }}>
                  <Text style={{ color: '#fff', fontSize: 30, fontWeight: '900' }}>Take {qtyLabel(o.dose.qty, o.med.unit)}</Text>
                  <Text style={{ color: '#fff', fontSize: 17, fontWeight: '600' }}>
                    {medLabel(o.med)}
                    {lang !== 'en' ? `  ·  ${amountText(lang, o.dose.qty, o.med.unit)}` : ''}
                  </Text>
                  {o.dose.qty !== 1 && o.med.unit === 'tablet' && (
                    <Text style={{ color: '#fff', marginTop: 2 }}>
                      {o.dose.qty < 1 ? 'Break the tablet along the line.' : 'More than one tablet — count carefully.'}
                    </Text>
                  )}
                  {o.med.notes ? <Text style={{ color: '#fffd', marginTop: 4 }}>{o.med.notes}</Text> : null}
                </View>
              ))}
              <Text style={{ color: '#fffc', marginTop: 10, fontSize: 13 }}>Check the name on the strip too.</Text>
              {result.learned && (
                <View style={{ backgroundColor: '#0003', borderRadius: 10, padding: 10, marginTop: 12 }}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Recognised from a strip you taught the app.</Text>
                  <Text style={{ color: '#fff' }}>Glance at the name and strength before taking.</Text>
                </View>
              )}
              {result.substitute && (
                <View style={{ backgroundColor: '#0003', borderRadius: 10, padding: 10, marginTop: 12 }}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Same medicine, different brand: {result.substitute}</Text>
                  <Text style={{ color: '#fff' }}>Check it's the one you bought for this before taking.</Text>
                </View>
              )}
              <View style={[s.row, { gap: 10, marginTop: 14 }]}>
                <Button title="Mark taken" kind="secondary" onPress={() => confirm(result.occs, result.method, result.expiry)} style={{ flex: 1 }} />
                <Button title="Cancel" kind="ghost" onPress={dismiss} />
              </View>
              <ReadBy />
            </View>
          )}

          {result?.kind === 'check' && (
            <View style={{ backgroundColor: t.warn, borderRadius: 18, padding: 18, marginTop: 8 }}>
              <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>⚠ Check the strength</Text>
              {result.expiry && expiryStatus(result.expiry) === 'expired' && (
                <View style={{ backgroundColor: t.bad, borderRadius: 12, padding: 12, marginTop: 10 }}>
                  <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>This strip expired in {formatExpiry(result.expiry)}.</Text>
                  <Text style={{ color: '#fff', marginTop: 2 }}>Don't take it — use another strip or ask your pharmacist.</Text>
                </View>
              )}
              <Text style={{ color: '#fff', fontSize: 17, marginTop: 6 }}>
                The name matches {result.occ.med.name}, but the strength couldn't be read (torn or shiny).
              </Text>
              <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900', marginTop: 10 }}>Strip must say {spokenStrength(result.occ.med.strength)}</Text>
              <Text style={{ color: '#fff', fontSize: 17, marginTop: 4 }}>Then take {qtyLabel(result.occ.dose.qty, result.occ.med.unit)}.</Text>
              <Button
                big
                title={`It says ${spokenStrength(result.occ.med.strength)} — mark taken`}
                kind="secondary"
                onPress={() => confirm([result.occ], 'manual', result.expiry)}
                style={{ marginTop: 14 }}
              />
              <Button title="Scan again" kind="ghost" onPress={dismiss} />
              <ReadBy />
            </View>
          )}

          {result?.kind === 'strength' && (
            <View style={{ backgroundColor: '#B91C1C', borderRadius: 18, padding: 18, marginTop: 8 }}>
              <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>✋ Different strength — don't take</Text>
              <Text style={{ color: '#fff', fontSize: 17, marginTop: 6 }}>
                This is {result.occ.med.name} {result.found.map((f) => `${f} mg`).join(' / ')}. The prescription is {medLabel(result.occ.med)}
                {spokenStrength(result.occ.med.strength) && !/[a-z]/i.test(result.occ.med.strength) ? ' mg' : ''}, {qtyLabel(result.occ.dose.qty, result.occ.med.unit)}.
              </Text>
              <Text style={{ color: '#fff', marginTop: 6 }}>Ask the doctor or pharmacist before using a different strength. If the reading is wrong, scan again.</Text>
              <Button title="Scan next" kind="secondary" big onPress={dismiss} style={{ marginTop: 14 }} />
            </View>
          )}

          {result?.kind === 'nomatch' && (
            <View style={{ backgroundColor: t.bad, borderRadius: 18, padding: 18, marginTop: 8 }}>
              <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800' }}>✗ No match</Text>
              <Text style={{ color: '#fff', fontSize: 16, marginTop: 6 }}>{result.reason}</Text>
              {result.detail ? <Text style={{ color: '#fffc', marginTop: 6, fontStyle: 'italic' }}>Read: “{result.detail}”</Text> : null}
              <ReadBy />
              <Button title="Scan next" kind="secondary" big onPress={dismiss} style={{ marginTop: 14 }} />
              {!result.code && <TeachChips />}
              {result.code && (
                <>
                  <Text style={{ color: '#fff', marginTop: 14, fontWeight: '600' }}>Is this one of these? Link the code once:</Text>
                  <View style={[s.wrap, { marginTop: 8 }]}>
                    {due.map((o) => (
                      <Pressable
                        key={o.key}
                        onPress={() => {
                          linkBarcode(o.med.id, result.code!);
                          show({ kind: 'match', occs: [o], method: 'barcode' });
                        }}
                        style={{ backgroundColor: '#fff3', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, marginRight: 8, marginBottom: 8 }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700' }}>{medLabel(o.med)}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}
            </View>
          )}

          {/* Fallback */}
          {!result && (
            <Card style={{ marginTop: 16 }}>
              <Text style={{ color: t.sub, fontWeight: '700', marginBottom: 8 }}>Can't scan? Type the name on the strip</Text>
              <View style={[s.row, { gap: 8 }]}>
                <Field value={typed} onChangeText={setTyped} placeholder="e.g. Dolo 650" autoCapitalize="characters" style={{ flex: 1 }} />
                <Button title="Check" onPress={() => typed.trim() && ((lastRead.current = { lines: [], photos: [] }), checkText(typed, 'manual'))} />
              </View>
            </Card>
          )}
        </>
      )}
    </ScrollView>
  );
}
