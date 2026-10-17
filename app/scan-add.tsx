import { BarcodeScanningResult, BarcodeType, CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { parseExpiry } from '../src/expiry.ts';
import { parseLabel, type LabelResult, type OcrLine } from '../src/label.ts';
import { isNotLinkedError, readBurst } from '../src/ocr.ts';
import { loadRegionModel, setRegionDetectorEnabled } from '../src/regionModel.ts';
import { encode, fingerprint } from '../src/learn.ts';
import { saveReference } from '../src/profileFiles.ts';
import { buildProfile } from '../src/stripProfile.ts';
import { saveTrainingPhotos, saveUnlabelledPhotos } from '../src/training.ts';
import { useStore } from '../src/store.tsx';
import { Button, Card, Chip, Field, Label, More, s, Steps, useTheme } from '../src/ui.tsx';
import { UNITS, UNIT_LABEL } from '../src/units.ts';

const BARCODES: BarcodeType[] = ['qr', 'datamatrix', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'itf14'];

export default function ScanToAdd() {
  const t = useTheme();
  const { memberId } = useLocalSearchParams<{ memberId?: string }>();
  const { state } = useStore();
  const [perm, requestPerm] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [barcode, setBarcode] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [lines, setLines] = useState<OcrLine[]>([]); // everything read so far, across photos
  const [photos, setPhotos] = useState(0);
  const photoUris = useRef<string[]>([]);
  useEffect(() => {
    setRegionDetectorEnabled(state.settings.regionDetector !== false);
    loadRegionModel();
  }, [state.settings.regionDetector]);
  // Leaving without "Use this" (unreadable, wrong reading, gave up): keep the photos unlabelled for retraining.
  const leaving = useRef({ collect: false, text: '', error: '' });
  useEffect(
    () => () => {
      const l = leaving.current;
      if (l.collect && photoUris.current.length) {
        saveUnlabelledPhotos(photoUris.current, 'failed-add', l.error || 'Left Scan to add without using the reading.', l.text).catch(() => {});
      }
    },
    [],
  );
  leaving.current = { collect: !!state.settings.collectTraining, text: lines.map((l) => l.text).join('\n'), error: error ?? '' };
  const [result, setResult] = useState<LabelResult>();
  const [showCamera, setShowCamera] = useState(true);
  const [edited, setEdited] = useState(false);
  const [torch, setTorch] = useState(false);
  const [progress, setProgress] = useState('');

  const onBarcode = ({ data }: BarcodeScanningResult) => {
    if (data === barcode) return;
    setBarcode(data);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (/[A-Za-z]{4,}/.test(data)) {
      // Some QR codes carry the product name as text — add it to what's been read.
      const qrLines = data.split(/[\n;|]/).map((text) => ({ text }));
      const all = [...lines, ...qrLines];
      setLines(all);
      if (result) setResult(parseLabel(all, data));
    } else if (result) setResult({ ...result, barcodes: [data] });
  };

  const takePhoto = async () => {
    if (!camera.current || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const cam = camera.current;
      const read = await readBurst(async () => {
        const uri = (await cam.takePictureAsync({ quality: 0.9, shutterSound: false })).uri;
        photoUris.current.push(uri);
        return uri;
      }, {
        shots: 3,
        onShot: (n, of) => setProgress(n < of ? `Photo ${n} of ${of} — tilt the strip a little…` : `Photo ${n} of ${of}…`),
      });
      setProgress('Reading the strip…');
      if (!read.length) {
        setError('No text found. Hold the strip flat, fill the frame, and tilt it slightly to avoid glare.');
        return;
      }
      const all = [...lines, ...read];
      setLines(all);
      setPhotos((n) => n + 1);
      const r = parseLabel(all, barcode);
      // A fresh reading with more text is better — but keep anything the person typed themselves.
      setResult(result && edited ? { ...r, name: result.name, strength: result.strength, unit: result.unit } : r);
      setShowCamera(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      setError(isNotLinkedError(e) ? 'Reading text needs the installed app build (not Expo Go).' : 'Could not read the strip. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const useIt = async () => {
    if (!result) return;
    const aliases = [...result.aliases];
    // Keep the medicine contents as a second name so a torn strip still verifies.
    const generic = result.ingredients.map((i) => `${i.name} ${i.strength ?? ''}`.trim()).join(' + ');
    if (generic && result.name.trim().toLowerCase() !== result.ingredients.map((i) => i.name).join(' + ').toLowerCase() && !aliases.includes(generic)) aliases.push(generic);
    const prefill = {
      name: result.name.trim(),
      strength: result.strength.trim(),
      unit: result.unit,
      aliases,
      barcodes: barcode ? [barcode] : [],
      notes: result.contents ? `Contains ${result.contents}.` : undefined,
      learned: lines.length ? [encode(fingerprint(lines.map((l) => l.text)))] : [],
      expiry: parseExpiry(lines.map((l) => l.text).join('\n')),
      // Scanning to add is the strip being scanned on purpose: keep its profile (spec 15).
      profile: lines.length ? buildProfile(lines.map((l) => l.text), Math.min(2, photos)) : undefined,
    };
    if (prefill.profile && photoUris.current[0]) {
      try {
        prefill.profile = { ...prefill.profile, anchors: [await saveReference(photoUris.current[0])] };
      } catch {
        // the words are what matter today
      }
    }
    if (state.settings.collectTraining && photoUris.current.length) {
      saveTrainingPhotos(photoUris.current, { name: prefill.name, strength: prefill.strength, contents: result.contents }, 'scan-to-add', lines.map((l) => l.text).join('\n')).catch(() => {});
    }
    photoUris.current = []; // saved with their label; nothing left to keep as unlabelled
    router.replace({ pathname: '/med/[id]', params: { id: 'new', memberId: memberId ?? state.members[0]?.id, prefill: JSON.stringify(prefill) } });
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Scan to add' }} />

      <Steps step={1} total={2} label="What it is" />

      {showCamera && (
        <>
          <Text style={{ color: t.text, fontSize: 18, marginBottom: 12 }}>
            {photos ? 'Now show the side that lists what is inside.' : 'Hold the printed side up to the camera. Any way up is fine.'}
          </Text>
          <View style={{ height: 320, borderRadius: 20, overflow: 'hidden', backgroundColor: '#000' }}>
            {!perm ? null : !perm.granted ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                <Text style={{ color: '#fff', textAlign: 'center', marginBottom: 12 }}>Camera access is needed to scan medicines.</Text>
                <Button title="Allow camera" onPress={requestPerm} />
              </View>
            ) : (
              <CameraView
                ref={camera}
                style={{ flex: 1 }}
                facing="back"
                autofocus="on"
                flash="off"
                enableTorch={torch}
                barcodeScannerSettings={{ barcodeTypes: BARCODES }}
                onBarcodeScanned={onBarcode}
              />
            )}
            {perm?.granted && (
              <Pressable
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
                <Text style={{ color: '#fff', marginTop: 8, textAlign: 'center', paddingHorizontal: 16 }}>{progress || 'Reading the strip…'}</Text>
              </View>
            )}
          </View>
          {barcode && <Text style={{ color: t.ok, marginTop: 10, fontSize: 17, fontWeight: '700' }}>✓ Barcode saved</Text>}
          {error && <Text style={{ color: t.bad, marginTop: 10, fontSize: 17 }}>{error}</Text>}
          <Button big title={photos ? 'Read this side too' : 'Read the strip'} onPress={takePhoto} disabled={busy || !perm?.granted} style={{ marginTop: 12 }} />
          {result ? (
            <Button title="Back to what was read" kind="ghost" onPress={() => setShowCamera(false)} style={{ marginTop: 10 }} />
          ) : (
            <More title="Shiny strip, or can't scan?">
              <Text style={{ color: t.sub, fontSize: 16, lineHeight: 22 }}>Move away from ceiling lights and windows, and tilt the strip slowly while it takes 3 photos.</Text>
              <Button title="Type it in instead" kind="ghost" onPress={() => router.replace({ pathname: '/med/[id]', params: { id: 'new', memberId } })} />
            </More>
          )}
        </>
      )}

      {result && !showCamera && (
        <>
          <Card>
            <Text style={{ color: t.sub, fontSize: 16, fontWeight: '700' }}>Medicine inside</Text>
            {result.ingredients.length ? (
              <Text style={{ color: t.text, fontSize: 20, fontWeight: '800', marginTop: 4 }}>{result.contents}</Text>
            ) : (
              <Text style={{ color: t.warn, fontSize: 17, marginTop: 4 }}>
                Couldn't read what's inside. That's fine — you can carry on.
              </Text>
            )}

            <Label>Name</Label>
            <Field value={result.name} onChangeText={(name) => (setEdited(true), setResult({ ...result, name }))} autoCapitalize="words" />
            {result.nameOptions.length > 0 && (
              <>
                <Text style={{ color: t.sub, marginTop: 10, marginBottom: 8, fontSize: 16 }}>Or tap the right one:</Text>
                <View style={s.wrap}>
                  {result.nameOptions.map((n) => (
                    <Chip key={n} label={n} active={n === result.name} onPress={() => setResult({ ...result, name: n })} />
                  ))}
                </View>
              </>
            )}

            <Label>Strength</Label>
            <Field value={result.strength} onChangeText={(strength) => (setEdited(true), setResult({ ...result, strength }))} placeholder="e.g. 75 or 10/40" />

            <Label>Form</Label>
            <View style={s.wrap}>
              {UNITS.map((u) => (
                <Chip key={u} label={UNIT_LABEL[u] ?? u} active={result.unit === u} onPress={() => setResult({ ...result, unit: u })} />
              ))}
            </View>
            {barcode && <Text style={{ color: t.ok, fontSize: 17, fontWeight: '700', marginTop: 14 }}>✓ Barcode saved</Text>}
          </Card>

          <Button big title="Next: when to take it" onPress={useIt} disabled={!result.name.trim()} style={{ marginTop: 16 }} />
          <More>
          <Button title="Photograph another side" kind="secondary" onPress={() => setShowCamera(true)} />
          <Button
            title="Start again"
            kind="ghost"
            onPress={() => {
              setLines([]);
              setPhotos(0);
              photoUris.current = [];
              setResult(undefined);
              setEdited(false);
              setShowCamera(true);
            }}
          />
          </More>
        </>
      )}
    </ScrollView>
  );
}
