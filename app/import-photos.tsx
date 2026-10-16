// Collect strip photos for training (spec 13), like Test scan: take a photo with the camera, or add photos from the
// library (e.g. ones friends sent on WhatsApp or by email). Each photo is scanned like a live scan, so it keeps the
// scan trace (detector boxes, text per step, spec 12), and is saved labelled with the medicine the person names, with
// whether the scanner recognised it. "Send for training" emails (or shares) them right from here.

import * as ImagePicker from 'expo-image-picker';
import { Stack, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, Text, View } from 'react-native';
import { importSummary, judgeImport, parseTypedLabel, type ImportLabel, type ImportScan } from '../src/importPhotos.ts';
import { readLinesAnyOrientation, startScanStats } from '../src/ocr.ts';
import { loadRegionModel, setRegionDetectorEnabled } from '../src/regionModel.ts';
import { medLabel } from '../src/schedule.ts';
import { useStore } from '../src/store.tsx';
import { sendForTraining } from '../src/sendForTraining.tsx';
import { saveTrainingPhotos, saveUnlabelledPhotos, TRAINING_EMAIL, trainingSummary } from '../src/training.ts';
import { Button, Card, Chip, Field, Label, s, useTheme } from '../src/ui.tsx';

const MAX_PHOTOS = 30;

interface Done {
  uri: string;
  scan: ImportScan;
  read: string;
  label?: ImportLabel; // undefined: saved unlabelled
}

export default function ImportPhotos() {
  const t = useTheme();
  const { state, saveSettings } = useStore();
  const [medId, setMedId] = useState<string | 'typed' | 'unknown'>('typed');
  const [name, setName] = useState('');
  const [strength, setStrength] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [done, setDone] = useState<Done[]>([]);
  const [unsent, setUnsent] = useState(() => trainingSummary().unsent);
  useFocusEffect(useCallback(() => setUnsent(trainingSummary().unsent), []));

  useEffect(() => {
    setRegionDetectorEnabled(state.settings.regionDetector !== false);
    loadRegionModel();
  }, [state.settings.regionDetector]);

  // Medicines already in the app first; anything else can be typed.
  const meds = useMemo(() => {
    const seen = new Set<string>();
    return state.meds.filter((m) => {
      const k = medLabel(m).toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [state.meds]);

  const label: ImportLabel | null | 'unknown' =
    medId === 'unknown'
      ? 'unknown'
      : medId === 'typed'
        ? parseTypedLabel(name, strength)
        : (() => {
            const m = meds.find((x) => x.id === medId);
            return m ? { name: m.name, strength: m.strength } : null;
          })();

  const takePhoto = async () => {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) return;
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
    if (!res.canceled) await scanAndSave(res.assets.map((a) => a.uri));
  };
  const choose = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsMultipleSelection: true, selectionLimit: MAX_PHOTOS });
    if (!res.canceled) await scanAndSave(res.assets.map((a) => a.uri).slice(0, MAX_PHOTOS));
  };

  /** Scans each photo like a live scan and saves it with the chosen medicine; newest results first. */
  const scanAndSave = async (photos: string[]) => {
    if (!photos.length || !label || busy) return;
    setBusy(true);
    const out: Done[] = [];
    for (let i = 0; i < photos.length; i++) {
      const uri = photos[i];
      setProgress(photos.length > 1 ? `Scanning photo ${i + 1} of ${photos.length}…` : 'Scanning…');
      startScanStats();
      let text = '';
      try {
        text = (await readLinesAnyOrientation(uri)).map((l) => l.text).join('\n');
      } catch {
        // saved anyway, as "not recognised", with nothing read
      }
      if (label === 'unknown') {
        await saveUnlabelledPhotos([uri], 'imported', 'Added from the photo library; medicine not known.', text);
        out.push({ uri, scan: 'not recognised', read: text });
      } else {
        const scan = judgeImport(text, label);
        await saveTrainingPhotos([uri], label, 'imported', text, { scan });
        out.push({ uri, scan, read: text });
      }
      setDone((prev) => [{ ...out[out.length - 1], label: label === 'unknown' ? undefined : label }, ...prev]);
    }
    setUnsent(trainingSummary().unsent);
    setProgress('');
    setBusy(false);
  };

  if (!state.settings.collectConsent)
    return (
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <Stack.Screen options={{ title: 'Collect strip photos' }} />
        <Card>
          <Text style={{ color: t.text, fontSize: 18, fontWeight: '800' }}>Before you start</Text>
          {[
            'You photograph medicine strips and say which medicine each one is. The photos help train the app’s strip scanner.',
            `Photos stay on this phone until you tap Send for training. Then they go, with the medicine names and the text the scanner read, to ${TRAINING_EMAIL} — you see the email or share sheet and send it yourself.`,
            'Photograph only the strip. Keep prescriptions, names, faces, addresses and anything else personal out of the picture.',
            'Medicines say something about someone’s health: only photograph strips you are allowed to share.',
            'You can delete the photos any time: Settings → Training photos → Delete all.',
          ].map((x) => (
            <View key={x} style={[s.row, { marginTop: 10, alignItems: 'flex-start' }]}>
              <Text style={{ color: t.text, width: 18 }}>•</Text>
              <Text style={{ color: t.text, flex: 1, lineHeight: 21 }}>{x}</Text>
            </View>
          ))}
          <Button title="I understand — start" onPress={() => saveSettings({ ...state.settings, collectConsent: new Date().toISOString() })} style={{ marginTop: 16 }} />
        </Card>
      </ScrollView>
    );

  const scanColor = (r: ImportScan) => (r === 'recognised' ? t.ok : r === 'name only' ? t.warn : t.bad);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Collect strip photos' }} />
      <Text style={{ color: t.sub, lineHeight: 20 }}>
        Photograph medicine strips (or add photos friends sent). Each photo is scanned as a real scan would be, then kept as a training
        photo labelled with the medicine you choose, with what the scanner made of it. Strips the scanner fails on are the most useful.
      </Text>

      <Label>1 · Which medicine is in the next photos?</Label>
      <Card>
        <View style={s.wrap}>
          {meds.map((m) => (
            <Chip key={m.id} label={medLabel(m)} active={medId === m.id} onPress={() => setMedId(m.id)} />
          ))}
          <Chip label="Type a name" active={medId === 'typed'} onPress={() => setMedId('typed')} />
          <Chip label="Don't know" active={medId === 'unknown'} onPress={() => setMedId('unknown')} />
        </View>
        {medId === 'typed' && (
          <View style={{ marginTop: 10, gap: 8 }}>
            <Field placeholder="Name as printed, e.g. Vonzai" value={name} onChangeText={setName} autoCapitalize="words" />
            <Field placeholder="Strength, e.g. 20 (or 180/10)" value={strength} onChangeText={setStrength} />
          </View>
        )}
        {medId === 'unknown' && (
          <Text style={{ color: t.sub, marginTop: 8 }}>Saved without a label (unlabelled/ in the export) — still useful, but labelled photos help most.</Text>
        )}
        {!label && <Text style={{ color: t.bad, marginTop: 8 }}>Choose a medicine, or type its name.</Text>}
      </Card>

      <Label>2 · Photos</Label>
      <View style={[s.row, { gap: 10 }]}>
        <Button big title="Take a photo" onPress={takePhoto} disabled={busy || !label} style={{ flex: 1 }} />
        <Button big title="From library" kind="secondary" onPress={choose} disabled={busy || !label} style={{ flex: 1 }} />
      </View>
      <Text style={{ color: t.sub, marginTop: 6, fontSize: 13 }}>
        For each strip: the printed side flat, then tilted, then with the light on it, and the expiry area. Up to {MAX_PHOTOS} from the library at a time.
      </Text>
      {busy && (
        <View style={[s.row, { marginTop: 12, gap: 8 }]}>
          <ActivityIndicator />
          <Text style={{ color: t.text }}>{progress}</Text>
        </View>
      )}

      <Label>3 · Send</Label>
      <Button title={unsent ? `Send for training (${unsent} not sent yet)` : 'Send for training'} kind="secondary" disabled={busy || !unsent} onPress={() => sendForTraining(() => setUnsent(trainingSummary().unsent))} />
      <Text style={{ color: t.sub, marginTop: 6, fontSize: 13 }}>Emails a zip to {TRAINING_EMAIL}, or opens the share sheet — pick Gmail and send it to that address.</Text>

      {done.length > 0 && (
        <>
          <Label>Saved this time</Label>
          <Card>
            <Text style={{ color: t.text, fontWeight: '700' }}>{importSummary(done.map((d) => d.scan))}</Text>
            {done.map((d, i) => (
              <View key={d.uri} style={[s.row, { marginTop: 10, gap: 10, alignItems: 'flex-start' }]}>
                <Image source={{ uri: d.uri }} style={{ width: 48, height: 48, borderRadius: 6 }} resizeMode="cover" />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: scanColor(d.scan), fontWeight: '700' }}>
                    {d.label ? `${d.label.name} ${d.label.strength}`.trim() + ' — ' : ''}
                    {!d.label ? 'saved unlabelled' : d.scan === 'recognised' ? 'scanner recognised it' : d.scan === 'name only' ? 'name read, strength not' : 'scanner did not recognise it'}
                  </Text>
                  <Text style={{ color: t.sub, fontSize: 12 }} numberOfLines={2}>
                    Read: {d.read.replace(/\s+/g, ' ').trim().slice(0, 120) || '(nothing)'}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        </>
      )}
    </ScrollView>
  );
}
