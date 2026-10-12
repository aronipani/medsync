import { BarcodeScanningResult, BarcodeType, CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useIsFocused } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { MemberPicker } from '../../src/components.tsx';
import { matchBarcode, matchDetail, matchText } from '../../src/match.ts';
import { amountText, matchAnnouncement, phrase, spokenStrength, type LangCode, type PhraseKey } from '../../src/phrases.ts';
import { say, stopSpeaking, type SpeakStatus } from '../../src/speech.ts';
import { readBurst, readLinesAnyOrientation } from '../../src/ocr.ts';
import { Ionicons } from '@expo/vector-icons';
import { dueNow, medLabel, notDueToday, occurrencesForDate, qtyLabel } from '../../src/schedule.ts';
import { useStore } from '../../src/store.tsx';
import { dateKey, fmt12 } from '../../src/time.ts';
import type { LogMethod, Occurrence } from '../../src/types.ts';
import { Button, Card, Empty, Field, s, useTheme } from '../../src/ui.tsx';

const BARCODES: BarcodeType[] = ['qr', 'datamatrix', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'pdf417', 'itf14'];

type Result =
  | { kind: 'match'; occs: Occurrence[]; method: LogMethod; substitute?: string } // green
  | { kind: 'check'; occ: Occurrence; method: LogMethod } // amber: name matches, strength unreadable
  | { kind: 'strength'; occ: Occurrence; found: string[]; detail: string } // stop: different strength printed
  | { kind: 'nomatch'; reason: string; detail?: string; code?: string; say: PhraseKey }; // red

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
  const voiceOn = member?.voice !== false;
  const announcement = (r: Result): string => {
    switch (r.kind) {
      case 'match':
        return (
          matchAnnouncement(lang, r.occs.map((o) => ({ name: medLabel(o.med), qty: o.dose.qty, unit: o.med.unit }))) +
          (r.substitute ? ` ${phrase(lang, 'substitute')}` : '')
        );
      case 'check':
        return phrase(lang, 'checkStrength', { strength: spokenStrength(r.occ.med.strength) });
      case 'strength':
        return phrase(lang, 'otherStrength');
      case 'nomatch':
        return phrase(lang, r.say);
    }
  };
  const [speakStatus, setSpeakStatus] = useState<SpeakStatus>();
  useEffect(() => {
    if (result && voiceOn) say(lang, announcement(result), setSpeakStatus);
    if (!result) stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

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
    const why = explainMiss((o) => matchBarcode(data, o.med));
    show({ kind: 'nomatch', reason: why?.text ?? 'This code is not linked to any medicine due now.', code: data, say: why?.say ?? 'wrong' });
  };

  const checkText = (text: string, method: LogMethod) => {
    const checked = due.map((o) => ({ o, d: matchDetail(text, o.med) }));
    const hits = checked.filter((x) => x.d.level === 'match');
    if (hits.length) return show({ kind: 'match', occs: hits.map((x) => x.o), method });
    const subs = checked.filter((x) => x.d.level === 'substitute');
    if (subs.length) return show({ kind: 'match', occs: subs.map((x) => x.o), method, substitute: subs[0].d.via });
    const other = checked.find((x) => x.d.level === 'otherStrength');
    if (other) return show({ kind: 'strength', occ: other.o, found: other.d.foundStrengths ?? [], detail: text });
    const nameOnly = checked.find((x) => x.d.level === 'nameOnly');
    if (nameOnly) return show({ kind: 'check', occ: nameOnly.o, method });
    const why = explainMiss((o) => ['match', 'substitute'].includes(matchDetail(text, o.med).level));
    show({
      kind: 'nomatch',
      reason: why?.text ?? 'No medicine due now matches this strip.',
      detail: text.replace(/\s+/g, ' ').trim().slice(0, 90) || 'No readable text found — move closer, and tilt the strip away from lights to cut the shine.',
      say: why?.say ?? 'wrong',
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
      if (!due.some((o) => ['match', 'substitute'].includes(matchDetail(text, o.med).level))) {
        const more = await readBurst(take, { shots: 2, onShot: (n) => setProgress(`Shine check ${n}/2 — tilt the strip a little…`) });
        text += '\n' + more.map((l) => l.text).join('\n');
      }
      checkText(text, 'text');
    } catch (e) {
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

  const confirm = (occs: Occurrence[], method: LogMethod) => {
    record(occs, 'taken', method);
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
          {result && (
            <Pressable onPress={() => voiceOn && say(lang, announcement(result), setSpeakStatus)} style={{ alignSelf: 'flex-end', marginTop: 10, flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="volume-high-outline" size={20} color={t.brand} />
              <Text style={{ color: t.brand, fontWeight: '700', marginLeft: 6 }}>
                {!voiceOn ? 'Voice is off for this person' : speakStatus === 'noVoice' ? 'No voice for this language on this phone — see family member settings' : 'Say it again'}
              </Text>
            </Pressable>
          )}

          {result?.kind === 'match' && (
            <View style={{ backgroundColor: t.ok, borderRadius: 18, padding: 18, marginTop: 8 }}>
              <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>✓ Correct medicine</Text>
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
              {result.substitute && (
                <View style={{ backgroundColor: '#0003', borderRadius: 10, padding: 10, marginTop: 12 }}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Same medicine, different brand: {result.substitute}</Text>
                  <Text style={{ color: '#fff' }}>Check it's the one you bought for this before taking.</Text>
                </View>
              )}
              <View style={[s.row, { gap: 10, marginTop: 14 }]}>
                <Button title="Mark taken" kind="secondary" onPress={() => confirm(result.occs, result.method)} style={{ flex: 1 }} />
                <Button title="Cancel" kind="ghost" onPress={() => setResult(null)} />
              </View>
            </View>
          )}

          {result?.kind === 'check' && (
            <View style={{ backgroundColor: t.warn, borderRadius: 18, padding: 18, marginTop: 8 }}>
              <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>⚠ Check the strength</Text>
              <Text style={{ color: '#fff', fontSize: 17, marginTop: 6 }}>
                The name matches {result.occ.med.name}, but the strength couldn't be read (torn or shiny).
              </Text>
              <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900', marginTop: 10 }}>Strip must say {spokenStrength(result.occ.med.strength)}</Text>
              <Text style={{ color: '#fff', fontSize: 17, marginTop: 4 }}>Then take {qtyLabel(result.occ.dose.qty, result.occ.med.unit)}.</Text>
              <Button
                big
                title={`It says ${spokenStrength(result.occ.med.strength)} — mark taken`}
                kind="secondary"
                onPress={() => confirm([result.occ], 'manual')}
                style={{ marginTop: 14 }}
              />
              <Button title="Scan again" kind="ghost" onPress={() => setResult(null)} />
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
              <Button title="Scan next" kind="secondary" big onPress={() => setResult(null)} style={{ marginTop: 14 }} />
            </View>
          )}

          {result?.kind === 'nomatch' && (
            <View style={{ backgroundColor: t.bad, borderRadius: 18, padding: 18, marginTop: 8 }}>
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
