import { BarcodeScanningResult, BarcodeType, CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useIsFocused } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { MemberPicker } from '../../src/components.tsx';
import { matchBarcode, matchText } from '../../src/match.ts';
import { readBurst, readLinesAnyOrientation } from '../../src/ocr.ts';
import { Ionicons } from '@expo/vector-icons';
import { dueNow, medLabel, notDueToday, occurrencesForDate, qtyLabel } from '../../src/schedule.ts';
import { useStore } from '../../src/store.tsx';
import { dateKey, fmt12 } from '../../src/time.ts';
import type { LogMethod, Occurrence } from '../../src/types.ts';
import { Button, Card, Empty, Field, s, useTheme } from '../../src/ui.tsx';

const BARCODES: BarcodeType[] = ['qr', 'datamatrix', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'pdf417', 'itf14'];

type Result =
  | { kind: 'match'; occs: Occurrence[]; method: LogMethod }
  | { kind: 'nomatch'; reason: string; detail?: string; code?: string };

export default function Scan() {
  const t = useTheme();
  const focused = useIsFocused();
  const { state, now, record, linkBarcode } = useStore();
  const [perm, requestPerm] = useCameraPermissions();
  const camera = useRef<CameraView>(null);

  // Default to the first family member who has something due.
  const firstDue = useMemo(() => state.members.find((m) => dueNow(state, now, m.id).length)?.id, [state, now]);
  const [memberId, setMemberId] = useState<string | undefined>(firstDue ?? state.members[0]?.id);
  useEffect(() => {
    if (!memberId || !state.members.some((m) => m.id === memberId)) setMemberId(firstDue ?? state.members[0]?.id);
  }, [firstDue, memberId, state.members]);

  const due = useMemo(() => dueNow(state, now, memberId), [state, now, memberId]);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [torch, setTorch] = useState(false);
  const [typed, setTyped] = useState('');
  const lastCode = useRef({ code: '', at: 0 });

  useEffect(() => setResult(null), [memberId]);

  const feedback = (ok: boolean) =>
    Haptics.notificationAsync(ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => {});

  /** Explain why something that isn't due right now didn't match. */
  const explainMiss = (isThis: (o: Occurrence) => boolean): string | undefined => {
    const other = notDueToday(state, now, memberId).find(isThis);
    if (other) {
      if (other.status === 'taken') return `${medLabel(other.med)} (${fmt12(other.time)}) is already taken.`;
      if (other.status === 'upcoming') return `${medLabel(other.med)} is scheduled for ${fmt12(other.time)}, not now.`;
      return `${medLabel(other.med)} was due at ${fmt12(other.time)} (${other.status}).`;
    }
    const elsewhere = state.meds.find((m) => m.active && m.memberId !== memberId && isThis({ med: m } as Occurrence));
    if (elsewhere) {
      const who = state.members.find((m) => m.id === elsewhere.memberId)?.name;
      return `This looks like ${medLabel(elsewhere)}, which is ${who}'s medicine.`;
    }
    return undefined;
  };

  const show = (r: Result) => {
    setResult(r);
    feedback(r.kind === 'match');
  };

  const onBarcode = ({ data }: BarcodeScanningResult) => {
    if (result || busy || !due.length) return;
    const t0 = Date.now();
    if (data === lastCode.current.code && t0 - lastCode.current.at < 3000) return;
    lastCode.current = { code: data, at: t0 };
    const hits = due.filter((o) => matchBarcode(data, o.med));
    if (hits.length) return show({ kind: 'match', occs: hits, method: 'barcode' });
    show({
      kind: 'nomatch',
      reason: explainMiss((o) => matchBarcode(data, o.med)) ?? 'This code is not linked to any medicine due now.',
      code: data,
    });
  };

  const checkText = (text: string, method: LogMethod) => {
    const hits = due.filter((o) => matchText(text, o.med).matched);
    if (hits.length) return show({ kind: 'match', occs: hits, method });
    const strength = due.find((o) => matchText(text, o.med).nameFound);
    if (strength) {
      return show({
        kind: 'nomatch',
        reason: `Name matches ${strength.med.name}, but the strength is different. Expected ${medLabel(strength.med)}.`,
        detail: text,
      });
    }
    const why = explainMiss((o) => matchText(text, o.med).matched);
    show({
      kind: 'nomatch',
      reason: why ?? 'No medicine due now matches this strip.',
      detail: text.replace(/\s+/g, ' ').trim().slice(0, 90) || 'No readable text found — move closer, and tilt the strip away from lights to cut the shine.',
    });
  };

  const readStrip = async () => {
    if (!camera.current || busy) return;
    setBusy(true);
    try {
      const cam = camera.current;
      const take = async () => (await cam.takePictureAsync({ quality: 0.9, shutterSound: false })).uri;
      setProgress('Reading the strip…');
      let text = (await readLinesAnyOrientation(await take())).map((l) => l.text).join('\n');
      // Nothing matched? Glare may be hiding letters — take two more photos at slightly different angles.
      if (!due.some((o) => matchText(text, o.med).matched)) {
        const more = await readBurst(take, { shots: 2, onShot: (n) => setProgress(`Shine check ${n}/2 — tilt the strip a little…`) });
        text += '\n' + more.map((l) => l.text).join('\n');
      }
      checkText(text, 'text');
    } catch (e) {
      show({
        kind: 'nomatch',
        reason: 'Could not read text.',
        detail: String(e).includes('linked') ? 'Text reading needs the development build (not Expo Go). Barcode scanning still works.' : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const confirm = (r: Extract<Result, { kind: 'match' }>) => {
    record(r.occs, 'taken', r.method);
    setResult(null);
    setTyped('');
  };

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
          {result?.kind === 'match' && (
            <View style={{ backgroundColor: t.ok, borderRadius: 18, padding: 18, marginTop: 12 }}>
              <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800' }}>✓ Match</Text>
              {result.occs.map((o) => (
                <Text key={o.key} style={{ color: '#fff', fontSize: 18, fontWeight: '600', marginTop: 6 }}>
                  {medLabel(o.med)} — take {qtyLabel(o.dose.qty, o.med.unit)}
                </Text>
              ))}
              <View style={[s.row, { gap: 10, marginTop: 14 }]}>
                <Button title="Mark taken" kind="secondary" onPress={() => confirm(result)} style={{ flex: 1 }} />
                <Button title="Cancel" kind="ghost" onPress={() => setResult(null)} />
              </View>
            </View>
          )}

          {result?.kind === 'nomatch' && (
            <View style={{ backgroundColor: t.bad, borderRadius: 18, padding: 18, marginTop: 12 }}>
              <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800' }}>✗ No match</Text>
              <Text style={{ color: '#fff', fontSize: 16, marginTop: 6 }}>{result.reason}</Text>
              {result.detail ? <Text style={{ color: '#fffc', marginTop: 6, fontStyle: 'italic' }}>Read: “{result.detail}”</Text> : null}
              <Button title="Scan next" kind="secondary" big onPress={() => setResult(null)} style={{ marginTop: 14 }} />
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
                <Button title="Check" onPress={() => typed.trim() && checkText(typed, 'manual')} />
              </View>
            </Card>
          )}
        </>
      )}
    </ScrollView>
  );
}
