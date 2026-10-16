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
import { saveTrainingPhotos, saveUnlabelledPhotos } from '../src/training.ts';
import { useStore } from '../src/store.tsx';
import { Button, Card, Chip, Field, Label, s, useTheme } from '../src/ui.tsx';

const BARCODES: BarcodeType[] = ['qr', 'datamatrix', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'itf14'];
const UNITS = ['tablet', 'capsule', 'ml', 'drops', 'puff', 'sachet', 'injection'];

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

  const useIt = () => {
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
    };
    if (state.settings.collectTraining && photoUris.current.length) {
      saveTrainingPhotos(photoUris.current, { name: prefill.name, strength: prefill.strength, contents: result.contents }, 'scan-to-add', lines.map((l) => l.text).join('\n')).catch(() => {});
    }
    photoUris.current = []; // saved with their label; nothing left to keep as unlabelled
    router.replace({ pathname: '/med/[id]', params: { id: 'new', memberId: memberId ?? state.members[0]?.id, prefill: JSON.stringify(prefill) } });
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Scan to add' }} />

      {showCamera && (
        <>
          <Text style={{ color: t.sub, marginBottom: 10 }}>
            {photos
              ? 'Photograph another part of the strip — for example the side with the composition ("Each tablet contains…").'
              : 'Hold the printed side of the strip, bottle or box to the camera. Upside-down or sideways print is fine. Barcodes are picked up automatically.'}
          </Text>
          <View style={{ height: 320, borderRadius: 18, overflow: 'hidden', backgroundColor: '#000' }}>
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
                style={{ position: 'absolute', top: 10, right: 10, backgroundColor: '#0008', borderRadius: 20, padding: 8 }}
              >
                <Ionicons name={torch ? 'flashlight' : 'flashlight-outline'} size={22} color="#fff" />
              </Pressable>
            )}
            {busy && (
              <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0007' }}>
                <ActivityIndicator color="#fff" size="large" />
                <Text style={{ color: '#fff', marginTop: 8, textAlign: 'center', paddingHorizontal: 16 }}>{progress || 'Reading the strip…'}</Text>
              </View>
            )}
          </View>
          {barcode && <Text style={{ color: t.ok, marginTop: 8, fontWeight: '600' }}>✓ Barcode saved</Text>}
          {error && <Text style={{ color: t.bad, marginTop: 8 }}>{error}</Text>}
          <Text style={{ color: t.sub, marginTop: 10, fontSize: 15, lineHeight: 21 }}>
            Shiny foil? Stand away from overhead lights and window glare, keep the light off unless it's dark, and tilt the strip slowly while the 3 photos are taken.
          </Text>
          <Button big title={photos ? 'Read this side too' : 'Read the strip'} onPress={takePhoto} disabled={busy || !perm?.granted} style={{ marginTop: 12 }} />
          {result ? (
            <Button title="Back to results" kind="ghost" onPress={() => setShowCamera(false)} />
          ) : (
            <Button title="Type it in instead" kind="ghost" onPress={() => router.replace({ pathname: '/med/[id]', params: { id: 'new', memberId } })} />
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
              <Text style={{ color: t.warn, marginTop: 4 }}>
                Couldn't read what's inside. Add a photo of the part that says "Each tablet contains…" — or type it in below.
              </Text>
            )}

            <Label>Name to show in the schedule</Label>
            <Field value={result.name} onChangeText={(name) => (setEdited(true), setResult({ ...result, name }))} autoCapitalize="words" />
            {result.nameOptions.length > 0 && (
              <>
                <Text style={{ color: t.sub, marginTop: 8, marginBottom: 6, fontSize: 15 }}>
                  {result.brand ? `Brand found: ${result.brand}. Tap to choose:` : 'Tap to choose:'}
                </Text>
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
                <Chip key={u} label={u} active={result.unit === u} onPress={() => setResult({ ...result, unit: u })} />
              ))}
            </View>
            {barcode && <Text style={{ color: t.ok, marginTop: 12 }}>✓ Barcode linked</Text>}
          </Card>

          <Button big title="Next — set when to take it" onPress={useIt} disabled={!result.name.trim()} style={{ marginTop: 14 }} />
          <Button title="Add a photo of another side" kind="secondary" onPress={() => setShowCamera(true)} style={{ marginTop: 8 }} />
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
        </>
      )}
    </ScrollView>
  );
}
