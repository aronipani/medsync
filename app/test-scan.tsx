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
import { setupNotifications } from '../src/notifications.ts';
import { appleVisionAvailable, readBurst, readLinesAnyOrientation, scanDetectorLabel, scanReaderLabel, startScanStats } from '../src/ocr.ts';
import { detectorState, loadRegionModel, setRegionDetectorEnabled } from '../src/regionModel.ts';
import { medLabel } from '../src/schedule.ts';
import { useStore } from '../src/store.tsx';
import { classifyTest, recordFor, upcomingReadiness, type Readiness, type TestOutcome, type TestRecords } from '../src/testScan.ts';
import { loadTestRecords, saveTestRecord } from '../src/testScanStore.ts';
import { dateKey, fmt12, fmtDay } from '../src/time.ts';
import { saveTrainingPhotos, saveUnlabelledPhotos } from '../src/training.ts';
import { Button, Card, Label, s, useTheme } from '../src/ui.tsx';

interface Run {
  outcome: TestOutcome;
  text: string;
  photos: string[];
  seconds: number;
  reader: string;
  detector: string;
  expiry?: string;
  answered?: 'right' | 'wrong';
}

const READY_LABEL: Record<Readiness, string> = {
  ready: 'Ready',
  check: 'Strength not read last time',
  failed: 'Last test failed',
  untested: 'Not tested yet',
  stale: 'Tested over a month ago',
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
      let text = (await readLinesAnyOrientation(await take())).map((l) => l.text).join('\n');
      let outcome = classifyTest(text, state.meds);
      if (outcome.kind !== 'ok') {
        // The same glare retry as the real scan: two more photos at slightly different angles.
        const more = await readBurst(take, { shots: 2, onShot: (n) => setProgress(`Shine check ${n}/2 — tilt the strip a little…`) });
        text += '\n' + more.map((l) => l.text).join('\n');
        outcome = classifyTest(text, state.meds);
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
      if (rec) setRecords(await saveTestRecord(rec.medId, rec.record));
      if (outcome.kind === 'unknown' && state.settings.collectTraining) {
        saveUnlabelledPhotos(photos, 'test-scan', 'Test scan: no medicine recognised.', text).catch(() => {});
      }
      Haptics.notificationAsync(outcome.kind === 'ok' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
    } catch (e) {
      setRun({
        outcome: { kind: 'unknown' },
        text: String(e).includes('linked') ? 'Text reading needs the installed app build (not Expo Go).' : '',
        photos,
        seconds: Math.round((Date.now() - t0) / 100) / 10,
        reader: scanReaderLabel(),
        detector: scanDetectorLabel(),
      });
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  /** The person says whether the test got it right: right → labelled training photos; wrong → the test failed. */
  const answer = async (right: boolean) => {
    if (!run || run.answered || run.outcome.kind === 'unknown') return;
    const med = run.outcome.med;
    setRun({ ...run, answered: right ? 'right' : 'wrong' });
    if (right && run.outcome.kind === 'ok') {
      if (state.settings.collectTraining) saveTrainingPhotos(run.photos, { name: med.name, strength: med.strength }, 'test-scan', run.text).catch(() => {});
      return;
    }
    if (!right) {
      setRecords(await saveTestRecord(med.id, { at: new Date().toISOString(), result: 'failed', seconds: run.seconds, reader: run.reader, detector: run.detector }));
      if (state.settings.collectTraining) {
        saveUnlabelledPhotos(run.photos, 'test-scan', `Test scan read it as ${medLabel(med)}, which was wrong.`, run.text).catch(() => {});
      }
    }
  };

  const Check = ({ ok, label, detail, action }: { ok: boolean | undefined; label: string; detail?: string; action?: React.ReactNode }) => (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 6 }}>
      <Ionicons
        name={ok === undefined ? 'ellipse-outline' : ok ? 'checkmark-circle' : 'alert-circle'}
        size={22}
        color={ok === undefined ? t.sub : ok ? t.ok : t.warn}
        style={{ marginRight: 10, marginTop: 1 }}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontWeight: '600' }}>{label}</Text>
        {detail ? <Text style={{ color: t.sub, marginTop: 2 }}>{detail}</Text> : null}
        {action}
      </View>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Test scan' }} />
      <Text style={{ color: t.sub, marginBottom: 10 }}>
        Check everything works before the reminder comes. Scan any strip — nothing is logged, stock doesn't change and the app learns nothing.
      </Text>

      <Label>Ready for the next dose?</Label>
      <Card>
        <Check ok={perm?.granted} label="Camera" detail={perm?.granted ? 'Allowed' : 'Needed to scan strips'} action={perm && !perm.granted ? <Button title="Allow camera" kind="secondary" onPress={requestPerm} style={{ marginTop: 6 }} /> : undefined} />
        <Check
          ok={notif}
          label="Reminders"
          detail={
            notif === false
              ? 'Notifications are off — reminders won’t appear'
              : nextDose
                ? `Next: ${fmtDay(nextDose.date, today)} ${fmt12(nextDose.time)} · ${medLabel(nextDose.med)}`
                : 'Allowed · no doses in the next 24 hours'
          }
          action={notif === false ? <Button title="Allow reminders" kind="secondary" onPress={() => setupNotifications().then(setNotif)} style={{ marginTop: 6 }} /> : undefined}
        />
        <Check ok label="Text reader" detail={appleVisionAvailable() ? 'Apple Vision (ML Kit as backup)' : 'Google ML Kit'} />
        <Check
          ok={state.settings.regionDetector === false ? undefined : detector === 'ready' ? true : detector === 'missing' ? false : undefined}
          label="Region detector"
          detail={state.settings.regionDetector === false ? 'Off (Settings → Strip reading)' : detector === 'ready' ? 'Loaded' : detector === 'missing' ? 'Not in this build — full reading is used' : 'Loading…'}
        />
      </Card>

      <Label>Medicines due in the next 24 hours</Label>
      <Card>
        {!upcoming.length ? (
          <Text style={{ color: t.sub }}>Nothing scheduled in the next 24 hours.</Text>
        ) : (
          upcoming.map((u) => (
            <Check
              key={u.med.id}
              ok={u.readiness === 'ready' ? true : u.readiness === 'untested' ? undefined : false}
              label={`${medLabel(u.med)}${memberName(u.memberId) ? ` · ${memberName(u.memberId)}` : ''}`}
              detail={`${fmtDay(u.date, today)} ${fmt12(u.time)} · ${READY_LABEL[u.readiness]}${u.last?.seconds ? ` (${u.last.seconds}s)` : ''}`}
            />
          ))
        )}
        {upcoming.length > 0 && (
          <Text style={{ color: t.sub, marginTop: 6, fontSize: 13 }}>
            Scan each strip once. If one isn’t recognised, use “Teach this strip” on the Scan tab or check its name and strength in the medicine’s details.
          </Text>
        )}
      </Card>

      <View style={{ height: 300, borderRadius: 18, overflow: 'hidden', marginTop: 14, backgroundColor: '#000' }}>
        {perm?.granted && focused ? <CameraView ref={camera} style={{ flex: 1 }} facing="back" autofocus="on" flash="off" enableTorch={torch} /> : null}
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
            <Text style={{ color: '#fff', marginTop: 8 }}>{progress || 'Reading…'}</Text>
          </View>
        )}
      </View>
      <Button big title={run ? 'Test another strip' : 'Test scan'} onPress={test} disabled={busy || !perm?.granted} style={{ marginTop: 12 }} />

      {run && <Result run={run} onAnswer={answer} />}
    </ScrollView>
  );
}

function Result({ run, onAnswer }: { run: Run; onAnswer: (right: boolean) => void }) {
  const t = useTheme();
  const o = run.outcome;
  const color = o.kind === 'ok' ? t.ok : o.kind === 'check' ? t.warn : t.bad;
  const title =
    o.kind === 'ok'
      ? `✓ Recognised: ${medLabel(o.med)}`
      : o.kind === 'check'
        ? `⚠ ${medLabel(o.med)} — strength not read`
        : o.kind === 'strength'
          ? `✗ ${o.med.name} but strength ${o.found.join(' / ')}`
          : o.kind === 'conflict'
            ? `✗ Looks like ${o.looksLike}`
            : '✗ Not recognised';
  const meaning =
    o.kind === 'ok'
      ? o.substitute
        ? `Another brand of the same medicine (${o.via}). At dose time this shows green with a note to check the brand.`
        : 'At dose time this strip will show green.'
      : o.kind === 'check'
        ? 'At dose time you’ll be asked to read the strength yourself. Try less shine, closer, or the side with the strength.'
        : o.kind === 'strength'
          ? `At dose time this shows red: the prescription is ${medLabel(o.med)}.`
          : o.kind === 'conflict'
            ? `It was compared with ${medLabel(o.med)} and looks like a different medicine — at dose time this shows red.`
            : 'At dose time this would show red. Move closer, cut the shine, or teach the strip on the Scan tab.';
  const expired = run.expiry && expiryStatus(run.expiry) === 'expired';
  return (
    <View style={{ backgroundColor: color, borderRadius: 18, padding: 18, marginTop: 14 }}>
      <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>{title}</Text>
      <Text style={{ color: '#fff', fontSize: 16, marginTop: 6 }}>{meaning}</Text>
      {run.expiry ? (
        <Text style={{ color: '#fff', marginTop: 8, fontWeight: expired ? '800' : '400' }}>
          {expired ? `This strip expired in ${formatExpiry(run.expiry)}.` : `Expiry read: ${formatExpiry(run.expiry)}`}
        </Text>
      ) : null}
      {run.text.trim() ? (
        <Text style={{ color: '#fffc', marginTop: 8, fontStyle: 'italic' }} numberOfLines={3}>
          Read: “{run.text.replace(/\s+/g, ' ').trim().slice(0, 140)}”
        </Text>
      ) : null}
      <Text style={{ color: '#fffb', fontSize: 12, marginTop: 10 }}>
        {run.seconds}s · Read by {run.reader || '—'} · region detector: {run.detector}
      </Text>
      {o.kind !== 'unknown' && !run.answered && (
        <>
          <Text style={{ color: '#fff', marginTop: 14, fontWeight: '600' }}>Is this strip {medLabel(o.med)}?</Text>
          <View style={[s.row, { gap: 10, marginTop: 8 }]}>
            <Button title="Yes, that's right" kind="secondary" onPress={() => onAnswer(true)} style={{ flex: 1 }} />
            <Button title="No, it's wrong" kind="ghost" onPress={() => onAnswer(false)} style={{ flex: 1 }} />
          </View>
        </>
      )}
      {run.answered && (
        <Text style={{ color: '#fff', marginTop: 12 }}>
          {run.answered === 'right' ? 'Thanks — noted.' : 'Noted as a failed test. Check this medicine’s name and strength, or teach the strip on the Scan tab.'}
        </Text>
      )}
    </View>
  );
}
