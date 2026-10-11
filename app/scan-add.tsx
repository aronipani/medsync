import { BarcodeScanningResult, BarcodeType, CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { parseLabel, type LabelResult } from '../src/label.ts';
import { isNotLinkedError, readLines } from '../src/ocr.ts';
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
  const [result, setResult] = useState<LabelResult>();

  const onBarcode = ({ data }: BarcodeScanningResult) => {
    if (data === barcode) return;
    setBarcode(data);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    // Some QR codes carry the product name as text.
    if (!result && /[A-Za-z]{4,}/.test(data)) {
      const r = parseLabel(data.split(/[\n;|]/).map((text) => ({ text })), data);
      if (r.name) setResult(r);
    }
  };

  const readLabel = async () => {
    if (!camera.current || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.8, shutterSound: false });
      const lines = await readLines(photo.uri);
      if (!lines.length) {
        setError('No text found. Hold the label flat, fill the frame, and avoid glare.');
        return;
      }
      setResult(parseLabel(lines, barcode));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      setError(isNotLinkedError(e) ? 'Reading text needs the installed app build (not Expo Go).' : 'Could not read the label. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const useIt = () => {
    if (!result) return;
    const prefill = {
      name: result.name.trim(),
      strength: result.strength.trim(),
      unit: result.unit,
      aliases: result.aliases,
      barcodes: barcode ? [barcode] : [],
    };
    router.replace({ pathname: '/med/[id]', params: { id: 'new', memberId: memberId ?? state.members[0]?.id, prefill: JSON.stringify(prefill) } });
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Scan to add' }} />
      {!result && (
        <>
          <Text style={{ color: t.sub, marginBottom: 10 }}>
            Point at the strip, bottle or box so the medicine name fills the frame. Barcodes are picked up automatically.
          </Text>
          <View style={{ height: 320, borderRadius: 18, overflow: 'hidden', backgroundColor: '#000' }}>
            {!perm ? null : !perm.granted ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                <Text style={{ color: '#fff', textAlign: 'center', marginBottom: 12 }}>Camera access is needed to scan medicines.</Text>
                <Button title="Allow camera" onPress={requestPerm} />
              </View>
            ) : (
              <CameraView ref={camera} style={{ flex: 1 }} facing="back" autofocus="on" barcodeScannerSettings={{ barcodeTypes: BARCODES }} onBarcodeScanned={onBarcode} />
            )}
            {busy && (
              <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0007' }}>
                <ActivityIndicator color="#fff" size="large" />
                <Text style={{ color: '#fff', marginTop: 8 }}>Reading label…</Text>
              </View>
            )}
          </View>
          {barcode && <Text style={{ color: t.ok, marginTop: 8, fontWeight: '600' }}>✓ Barcode saved — it will be recognised when scanning doses.</Text>}
          {error && <Text style={{ color: t.bad, marginTop: 8 }}>{error}</Text>}
          <Button big title="Read label" onPress={readLabel} disabled={busy || !perm?.granted} style={{ marginTop: 12 }} />
          <Button title="Type it in instead" kind="ghost" onPress={() => router.replace({ pathname: '/med/[id]', params: { id: 'new', memberId } })} />
        </>
      )}

      {result && (
        <>
          <Card>
            <Text style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>Is this right?</Text>
            <Text style={{ color: t.sub, marginTop: 4 }}>Check against the pack and correct anything that's wrong.</Text>

            <Label>Name</Label>
            <Field value={result.name} onChangeText={(name) => setResult({ ...result, name })} autoCapitalize="words" />
            {result.nameOptions.length > 1 && (
              <>
                <Text style={{ color: t.sub, marginTop: 8, marginBottom: 6, fontSize: 13 }}>Other text on the pack — tap if one is the name:</Text>
                <View style={s.wrap}>
                  {result.nameOptions.map((n) => (
                    <Chip key={n} label={n} active={n === result.name} onPress={() => setResult({ ...result, name: n })} />
                  ))}
                </View>
              </>
            )}

            <Label>Strength</Label>
            <Field value={result.strength} onChangeText={(strength) => setResult({ ...result, strength })} placeholder="e.g. 650" />

            <Label>Form</Label>
            <View style={s.wrap}>
              {UNITS.map((u) => (
                <Chip key={u} label={u} active={result.unit === u} onPress={() => setResult({ ...result, unit: u })} />
              ))}
            </View>

            {result.aliases.length > 0 && (
              <>
                <Label>Generic name found</Label>
                <Text style={{ color: t.text }}>{result.aliases.join(', ')}</Text>
              </>
            )}
            {barcode && <Text style={{ color: t.ok, marginTop: 12 }}>✓ Barcode linked</Text>}
          </Card>
          <Button big title="Next — set when to take it" onPress={useIt} disabled={!result.name.trim()} style={{ marginTop: 14 }} />
          <Button title="Scan again" kind="ghost" onPress={() => setResult(undefined)} />
        </>
      )}
    </ScrollView>
  );
}
