// Test scan: check the scanner, reminders and each upcoming medicine before the reminder comes.
// Nothing is logged, no stock changes, nothing is learned. See docs/specs/11-test-scan.md.
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { Stack, useFocusEffect, useIsFocused } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { expiryStatus, formatExpiry, parseExpiry } from '../src/expiry.ts';
import { rescheduleAll, setupNotifications } from '../src/notifications.ts';
import { sendForTraining } from '../src/sendForTraining.tsx';
import { householdWords } from '../src/household.ts';
import { appleVisionAvailable, readBurst, readLinesAnyOrientation, readSecondLook, scanDetectorLabel, scanHints, scanReaderLabel, setHouseholdWords, startScanStats } from '../src/ocr.ts';
import { detectorState, loadRegionModel, setRegionDetectorEnabled } from '../src/regionModel.ts';
import { medLabel } from '../src/schedule.ts';
import type { Medication } from '../src/types.ts';
import { useStore } from '../src/store.tsx';
import { classifyTest, recordFor, upcomingReadiness, type Readiness, type TestOutcome, type TestRecords } from '../src/testScan.ts';
import { loadTestRecords, saveTestRecord } from '../src/testScanStore.ts';
import { dateKey, fmt12, fmtDay } from '../src/time.ts';
import { saveTrainingPhotos, saveUnlabelledPhotos } from '../src/training.ts';
import { keepsTraining } from '../src/edition.ts';
import { Button, Card, More, s, useTheme } from '../src/ui.tsx';

interface Run {
  outcome: TestOutcome;
  text: string;
  photos: string[];
  seconds: number;
  reader: string;
  detector: string;
  expiry?: string;
  answered?: 'right' | 'wrong';
  /** The medicine the person said the strip is, when the test got it wrong or recognised nothing. */
  picked?: Medication | 'none';
  /** Its photos have been kept for training (each test's photos are kept once). */
  kept?: boolean;
}

const READY_LABEL: Record<Readiness, string> = {
  ready: 'Ready',
  check: 'Strength not read last time — try again',
  failed: 'Didn’t work last time — try again',
  untested: 'Not checked yet',
  stale: 'Checked over a month ago — try again',
};

export default function TestScan() {
  const t = useTheme();
  const { state } = useStore();
  const focused = useIsFocused();
  const camera = useRef<CameraView>(null);
  const [perm, requestPerm] = useCameraPermissions();
  const [notif, setNotif] = useState<boolean | undefined>();
  const [records, setRecords] = useState<TestRecords>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [torch, setTorch] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [detector, setDetector] = useState(detectorState());

  /**
   * Keeps a test's photos for training, once, if training photos are on: labelled when the strip's medicine is
   * known (the test was right, or the person picked it), otherwise unlabelled with why.
   */
  const keep = (r: Run, label?: { name: string; strength: string }, reason?: string) => {
    if (r.kept || !r.photos.length) return;
    r.kept = true;
    if (!keepsTraining(state.settings)) return;
    if (label) saveTrainingPhotos(r.photos, label, 'test-scan', r.text).catch(() => {});
    else saveUnlabelledPhotos(r.photos, 'test-scan', reason ?? 'Test scan, not confirmed.', r.text).catch(() => {});
  };
  /** Leaving or starting the next test without answering: keep the photos unlabelled, saying what the test read. */
  const keepUnanswered = (r: Run | null) => {
    if (!r || r.kept) return;
    const o = r.outcome;
    keep(r, undefined, o.kind === 'unknown' ? 'Test scan: no medicine recognised.' : `Test scan read it as ${medLabel(o.med)} (${o.kind}); not confirmed.`);
  };
  const runRef = useRef<Run | null>(null);
  runRef.current = run;
  useEffect(() => () => keepUnanswered(runRef.current), []); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(
    useCallback(() => {
      loadTestRecords().then(setRecords);
      Notifications.getPermissionsAsync()
        .then((p) => setNotif(p.granted))
        .catch(() => setNotif(false));
    }, []),
  );
  useEffect(() => {
    setRegionDetectorEnabled(state.settings.regionDetector !== false);
    loadRegionModel().then(() => setDetector(detectorState()));
  }, [state.settings.regionDetector]);

  const now = new Date();
  const upcoming = useMemo(() => upcomingReadiness(state, records, new Date()), [state, records]);
  const today = dateKey(now);
  const nextDose = upcoming[0];
  const memberName = (id: string) => (state.members.length > 1 ? state.members.find((m) => m.id === id)?.name : undefined);

  const test = async () => {
    if (!camera.current || busy) return;
    setBusy(true);
    keepUnanswered(run);
    setRun(null);
    startScanStats();
    const photos: string[] = [];
    const t0 = Date.now();
    try {
      const cam = camera.current;
      const take = async () => {
        const uri = (await cam.takePictureAsync({ quality: 0.9, shutterSound: false })).uri;
        photos.push(uri);
        return uri;
      };
      setProgress('Reading the strip…');
      setHouseholdWords(householdWords(state.meds.filter((m) => m.active)));
      let text = (await readLinesAnyOrientation(await take())).map((l) => l.text).join('\n');
      let outcome = classifyTest(text, state.meds, scanHints());
      if (outcome.kind !== 'ok') {
        // Same as the real scan: a second look at this photo (other reader, household words) before new photos.
        setProgress('Looking again…');
        const again = await readSecondLook([...photos]);
        if (again.length) text += '\n' + again.map((l) => l.text).join('\n');
        outcome = classifyTest(text, state.meds, scanHints());
      }
      if (outcome.kind !== 'ok') {
        // The same glare retry as the real scan: two more photos at slightly different angles.
        const more = await readBurst(take, { shots: 2, onShot: (n) => setProgress(`Taking another photo (${n} of 2) — tilt the strip a little`) });
        text += '\n' + more.map((l) => l.text).join('\n');
        outcome = classifyTest(text, state.meds, scanHints());
      }
      const r: Run = {
        outcome,
        text,
        photos,
        seconds: Math.round((Date.now() - t0) / 100) / 10,
        reader: scanReaderLabel(),
        detector: scanDetectorLabel(),
        expiry: parseExpiry(text),
      };
      setRun(r);
      const rec = recordFor(outcome, { seconds: r.seconds, reader: r.reader, detector: r.detector });
      if (rec) {
        setRecords(await saveTestRecord(rec.medId, rec.record));
        rescheduleAll(state); // a passed test removes its "test-scan first" reminder; a failed one adds it
      }
      Haptics.notificationAsync(outcome.kind === 'ok' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
    } catch (e) {
      const failed: Run = {
        outcome: { kind: 'unknown' },
        text: String(e).includes('linked') ? 'Reading printed names does not work in this version of the app.' : '',
        photos,
        seconds: Math.round((Date.now() - t0) / 100) / 10,
        reader: scanReaderLabel(),
        detector: scanDetectorLabel(),
      };
      setRun(failed);
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  /**
   * The person says whether the test got it right. Right → the photos are labelled with what the strip is
   * (also when only the strength was missed, or a different strength was read — those are the hard examples).
   * Wrong → the test counts as failed and the person is asked which medicine it really is.
   */
  const answer = async (right: boolean) => {
    if (!run || run.answered || run.outcome.kind === 'unknown') return;
    const o = run.outcome;
    const next: Run = { ...run, answered: right ? 'right' : 'wrong' };
    if (right) {
      if (o.kind === 'ok' || o.kind === 'check') keep(next, { name: o.med.name, strength: o.med.strength });
      else if (o.kind === 'strength' && o.found.length) keep(next, { name: o.med.name, strength: o.found[0] });
      else keep(next, undefined, `Test scan: looks like ${o.kind === 'conflict' ? o.looksLike : 'another medicine'}, confirmed; not one of the saved medicines.`);
    } else {
      setRecords(await saveTestRecord(o.med.id, { at: new Date().toISOString(), result: 'failed', seconds: run.seconds, reader: run.reader, detector: run.detector }));
      rescheduleAll(state);
    }
    setRun(next);
  };

  /** "Which medicine is it?" after a wrong or failed test: labels the photos and marks that medicine's test failed. */
  const pick = async (med: Medication | 'none') => {
    if (!run) return;
    const next: Run = { ...run, picked: med };
    if (med === 'none') keep(next, undefined, 'Test scan: not recognised, and not one of the saved medicines.');
    else {
      keep(next, { name: med.name, strength: med.strength });
      setRecords(await saveTestRecord(med.id, { at: new Date().toISOString(), result: 'failed', seconds: run.seconds, reader: run.reader, detector: run.detector }));
      rescheduleAll(state);
    }
    setRun(next);
  };
  // Medicines due soonest first, then the rest — the strip being tested is most likely one of the first.
  const choices = useMemo(() => {
    const soon = upcoming.map((u) => u.med);
    return [...soon, ...state.meds.filter((m) => m.active && !soon.includes(m))];
  }, [upcoming, state.meds]);

  // Group the next 24 hours by time: several medicines are often due together.
  const groups = useMemo(() => {
    const m = new Map<string, typeof upcoming>();
    for (const u of upcoming) m.set(`${u.date}|${u.time}`, [...(m.get(`${u.date}|${u.time}`) ?? []), u]);
    return [...m.values()];
  }, [upcoming]);
  const readyCount = upcoming.filter((u) => u.readiness === 'ready').length;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Check the strips' }} />
      <Text style={{ color: t.text, fontSize: 18, lineHeight: 25 }}>Scan each strip before its reminder. Nothing is recorded — this is only a check.</Text>

      {/* Only problems are shown; when camera and reminders work there is nothing to read here. */}
      {perm && !perm.granted && (
        <Card style={{ backgroundColor: t.warnSoft, marginTop: 14 }}>
          <Text style={{ color: t.warn, fontSize: 18, fontWeight: '700' }}>The camera is needed to scan strips</Text>
          <Button title="Allow camera" onPress={requestPerm} style={{ marginTop: 12 }} />
        </Card>
      )}
      {notif === false && (
        <Card style={{ backgroundColor: t.warnSoft, marginTop: 14 }}>
          <Text style={{ color: t.warn, fontSize: 18, fontWeight: '700' }}>Reminders are off</Text>
          <Text style={{ color: t.text, fontSize: 16, marginTop: 4 }}>Without them, no reminder will appear at dose time.</Text>
          <Button title="Turn reminders on" onPress={() => setupNotifications().then(setNotif)} style={{ marginTop: 12 }} />
        </Card>
      )}

      <View style={[s.between, { marginTop: 24, marginBottom: 8, marginHorizontal: 4 }]}>
        <Text style={{ color: t.sub, fontSize: 17, fontWeight: '600' }}>Next 24 hours</Text>
        {upcoming.length > 0 && (
          <Text style={{ color: t.text, fontSize: 17, fontWeight: '600' }}>
            {readyCount} of {upcoming.length} ready
          </Text>
        )}
      </View>
      <Card style={{ paddingVertical: 4 }}>
        {!upcoming.length ? (
          <Text style={{ color: t.sub, fontSize: 17, paddingVertical: 14 }}>No medicines in the next 24 hours.</Text>
        ) : (
          groups.map((g, gi) => (
            <View key={`${g[0].date}|${g[0].time}`} style={{ paddingVertical: 10, borderBottomWidth: gi === groups.length - 1 ? 0 : 1, borderBottomColor: t.line }}>
              <Text style={{ color: t.sub, fontSize: 16, fontWeight: '600', marginBottom: 4 }}>
                {fmtDay(g[0].date, today)} · {fmt12(g[0].time)}
              </Text>
              {g.map((u) => (
                <View key={u.med.id + u.memberId} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 54 }}>
                  <ReadyMark r={u.readiness} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.text, fontSize: 19, fontWeight: u.readiness === 'ready' ? '600' : '700' }}>
                      {medLabel(u.med)}
                      {memberName(u.memberId) ? ` · ${memberName(u.memberId)}` : ''}
                    </Text>
                    <Text style={{ color: u.readiness === 'ready' ? t.sub : u.readiness === 'untested' ? t.text : t.warn, fontSize: 16, marginTop: 1 }}>
                      {READY_LABEL[u.readiness]}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ))
        )}
      </Card>

      <View style={{ height: run ? 220 : 300, borderRadius: 20, overflow: 'hidden', marginTop: 16, backgroundColor: '#000' }}>
        {perm?.granted && focused ? <CameraView ref={camera} style={{ flex: 1 }} facing="back" autofocus="on" flash="off" enableTorch={torch} /> : null}
        {perm?.granted && focused && (
          <Pressable
            onPress={() => setTorch((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={torch ? 'Turn light off' : 'Turn light on'}
            style={{ position: 'absolute', top: 10, right: 10, backgroundColor: '#0008', borderRadius: 26, width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name={torch ? 'flashlight' : 'flashlight-outline'} size={26} color="#fff" />
          </Pressable>
        )}
        {busy && (
          <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0007' }}>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={{ color: '#fff', fontSize: 17, marginTop: 8 }}>{progress || 'Reading the strip…'}</Text>
          </View>
        )}
      </View>
      <Button big title={run ? 'Check another strip' : 'Check a strip'} onPress={test} disabled={busy || !perm?.granted} style={{ marginTop: 12 }} />

      {run && <Result run={run} onAnswer={answer} onPick={pick} choices={choices} who={(m) => memberName(m.memberId)} details={!!state.settings.showScanDetails} />}

      {/* Helpers only. */}
      <More title="For helpers">
        <Text style={{ color: t.text, fontSize: 16 }}>Text reader: {appleVisionAvailable() ? 'Apple Vision (ML Kit as backup)' : 'Google ML Kit'}</Text>
        <Text style={{ color: t.text, fontSize: 16 }}>
          Strip area finder:{' '}
          {state.settings.regionDetector === false ? 'off' : detector === 'ready' ? 'on' : detector === 'missing' ? 'not in this version' : 'starting…'}
        </Text>
        {keepsTraining(state.settings) && <Button title="Send photos for training" kind="ghost" onPress={() => sendForTraining()} disabled={busy} />}
      </More>
    </ScrollView>
  );
}

/** Round mark like Today's: green ✓ ready, amber ! needs another try, outline not checked yet. */
function ReadyMark({ r }: { r: Readiness }) {
  const t = useTheme();
  if (r === 'ready')
    return (
      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: t.okFill, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="checkmark" size={20} color="#fff" />
      </View>
    );
  if (r === 'untested') return <View style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 2.5, borderColor: t.text }} />;
  return (
    <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: t.warnFill, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900' }}>!</Text>
    </View>
  );
}

const whiteChip = { backgroundColor: '#fff3', paddingHorizontal: 16, minHeight: 44, justifyContent: 'center' as const, borderRadius: 999, marginRight: 8, marginBottom: 8 };

function Result({
  run,
  onAnswer,
  onPick,
  choices,
  who,
  details,
}: {
  run: Run;
  onAnswer: (right: boolean) => void;
  onPick: (m: Medication | 'none') => void;
  choices: Medication[];
  who: (m: Medication) => string | undefined;
  details: boolean;
}) {
  const t = useTheme();
  const o = run.outcome;
  const fill = o.kind === 'ok' ? t.okFill : o.kind === 'check' ? t.warnFill : t.badFill;
  const icon = o.kind === 'ok' ? '✓' : o.kind === 'check' ? '!' : '✕';
  const title =
    o.kind === 'ok' ? 'Recognised' : o.kind === 'check' ? (o.partial ? 'Only part of the name read' : 'Strength not read') : o.kind === 'strength' ? 'Wrong strength' : o.kind === 'conflict' ? 'A different medicine' : 'Not recognised';
  const meaning =
    o.kind === 'ok'
      ? o.substitute
        ? 'A different brand of the same medicine. At dose time you’ll be asked to check the brand.'
        : 'This strip will be recognised at dose time.'
      : o.kind === 'check'
        ? o.partial
          ? `It looks like ${medLabel(o.med)}, but only part of the name could be read. At dose time the person will be asked to check the name.`
          : 'The name was read, but not the strength. Try closer, with less shine, or show the side with the strength.'
        : o.kind === 'strength'
          ? `This strip says ${o.found.map((f) => `${f} mg`).join(' / ')}. You need ${medLabel(o.med)}.`
          : o.kind === 'conflict'
            ? `This looks like ${o.looksLike}, not ${medLabel(o.med)}.`
            : run.text.startsWith('Reading printed names')
              ? run.text
              : 'Hold it closer, tilt it away from lights, and try again.';
  const expired = run.expiry && expiryStatus(run.expiry) === 'expired';
  return (
    <View style={{ backgroundColor: fill, borderRadius: 24, padding: 24, marginTop: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: fill, fontSize: 30, fontWeight: '900' }}>{icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800' }}>{title}</Text>
          {o.kind !== 'unknown' && <Text style={{ color: '#fff', fontSize: 19, fontWeight: '600', marginTop: 2 }}>{medLabel(o.med)}</Text>}
        </View>
      </View>
      <Text style={{ color: '#fff', fontSize: 17, lineHeight: 24, marginTop: 14 }}>{meaning}</Text>
      {run.expiry ? (
        <Text style={{ color: '#fff', fontSize: 17, marginTop: 10, fontWeight: expired ? '800' : '400' }}>
          {expired ? `This strip expired in ${formatExpiry(run.expiry)}. Don’t use it.` : `Expires ${formatExpiry(run.expiry)}`}
        </Text>
      ) : null}
      {details && (
        <>
          {run.text.trim() ? (
            <Text style={{ color: '#fff', marginTop: 10, fontStyle: 'italic' }} numberOfLines={3}>
              Read: “{run.text.replace(/\s+/g, ' ').trim().slice(0, 140)}”
            </Text>
          ) : null}
          <Text style={{ color: '#fff', fontSize: 14, marginTop: 8 }}>
            {run.seconds}s · Read by {run.reader || '—'} · strip area finder: {run.detector}
          </Text>
        </>
      )}
      {o.kind !== 'unknown' && !run.answered && (
        <>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 18 }}>Is this strip {medLabel(o.med)}?</Text>
          <View style={[s.row, { gap: 10, marginTop: 10 }]}>
            <Button title="Yes" kind="light" onPress={() => onAnswer(true)} style={{ flex: 1 }} />
            <Button title="No" kind="ghost" onColor onPress={() => onAnswer(false)} style={{ flex: 1 }} />
          </View>
        </>
      )}
      {(o.kind === 'unknown' || run.answered === 'wrong') && !run.picked && run.photos.length > 0 && (
        <>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 18 }}>Which medicine is it?</Text>
          <View style={[s.wrap, { marginTop: 10 }]}>
            {choices.map((m) => (
              <Pressable key={m.id} accessibilityRole="button" onPress={() => onPick(m)} style={whiteChip}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{[who(m), medLabel(m)].filter(Boolean).join(': ')}</Text>
              </Pressable>
            ))}
          </View>
          <Button title="None of these" kind="ghost" onColor onPress={() => onPick('none')} style={{ marginTop: 4 }} />
        </>
      )}
      {run.answered === 'right' && <Text style={{ color: '#fff', fontSize: 17, marginTop: 14 }}>Thank you — noted.</Text>}
      {(run.picked || (run.answered === 'wrong' && !run.photos.length)) && (
        <Text style={{ color: '#fff', fontSize: 17, lineHeight: 24, marginTop: 14 }}>
          {run.picked && run.picked !== 'none'
            ? `Noted. ${medLabel(run.picked)} needs another try: closer, with less shine.`
            : 'Noted. Check the medicine’s name and strength in Medicines.'}
        </Text>
      )}
    </View>
  );
}
