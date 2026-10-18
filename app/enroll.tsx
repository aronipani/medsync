// "Scan this strip once" (spec 15): reads a fresh strip of a medicine on purpose, checks it really is that
// medicine, and keeps its strip profile (distinctive words, reference photos, expiry) for dose-time scans.
// Works offline; nothing is sent anywhere.

import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { parseExpiry } from '../src/expiry.ts';
import { isNotLinkedError, readBurst, startScanStats } from '../src/ocr.ts';
import { withAnchors } from '../src/profileFiles.ts';
import { loadRegionModel, setRegionDetectorEnabled } from '../src/regionModel.ts';
import { medLabel } from '../src/schedule.ts';
import { useStore } from '../src/store.tsx';
import { buildProfile, checkEnroll, type EnrollCheck } from '../src/stripProfile.ts';
import { saveTrainingPhotos } from '../src/training.ts';
import { keepsTraining } from '../src/edition.ts';
import { Button, Card, More, useTheme } from '../src/ui.tsx';

export default function Enroll() {
  const t = useTheme();
  const { medId } = useLocalSearchParams<{ medId: string }>();
  const { state, setProfile, setExpiry, teach } = useStore();
  const med = state.meds.find((m) => m.id === medId);
  const [perm, requestPerm] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string>();
  const [check, setCheck] = useState<EnrollCheck>();
  const [showCamera, setShowCamera] = useState(true);
  // Per side: the text read and the first photo (kept as a reference picture).
  const sides = useRef<{ lines: string[]; photo: string; photos: string[] }[]>([]);
  useEffect(() => {
    setRegionDetectorEnabled(state.settings.regionDetector !== false);
    loadRegionModel();
  }, [state.settings.regionDetector]);

  if (!med) {
    return (
      <View style={{ padding: 16 }}>
        <Text style={{ color: t.text, fontSize: 18 }}>This medicine is no longer in the list.</Text>
      </View>
    );
  }
  const label = medLabel(med);
  const allLines = () => sides.current.flatMap((x) => x.lines);

  const read = async () => {
    if (!camera.current || busy) return;
    setBusy(true);
    setError(undefined);
    startScanStats();
    const photos: string[] = [];
    try {
      const cam = camera.current;
      const lines = await readBurst(
        async () => {
          const uri = (await cam.takePictureAsync({ quality: 0.9, shutterSound: false })).uri;
          photos.push(uri);
          return uri;
        },
        { shots: 3, onShot: (n, of) => setProgress(n < of ? `Photo ${n} of ${of} — tilt the strip a little…` : `Photo ${n} of ${of}…`) },
      );
      if (!lines.length) {
        setError('No text found. Hold the strip flat, fill the frame, and tilt it slightly to avoid glare.');
        return;
      }
      sides.current = [...sides.current, { lines: lines.map((l) => l.text), photo: photos[0], photos }];
      const c = checkEnroll(allLines().join('\n'), med, state.meds);
      setCheck(c);
      setShowCamera(false);
      Haptics.notificationAsync(c.kind === 'ok' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
    } catch (e) {
      setError(isNotLinkedError(e) ? 'Reading text needs the installed app build (not Expo Go).' : 'Could not read the strip. Try again.');
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const lines = allLines();
      const profile = await withAnchors(buildProfile(lines, sides.current.length, med.profile), sides.current.map((x) => x.photo));
      setProfile(med.id, profile);
      teach(med.id, lines);
      const ym = parseExpiry(lines.join('\n'));
      if (ym) setExpiry(med.id, ym);
      if (keepsTraining(state.settings)) {
        const photos = sides.current.flatMap((x) => x.photos);
        saveTrainingPhotos(photos, { name: med.name, strength: med.strength }, 'taught', lines.join('\n')).catch(() => {});
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
    } finally {
      setBusy(false);
    }
  };

  const again = () => {
    if (check?.kind !== 'ok') sides.current = sides.current.slice(0, -1); // drop the side that didn't fit
    setCheck(undefined);
    setShowCamera(true);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'Scan the strip once' }} />

      {showCamera && (
        <>
          <Text style={{ color: t.text, fontSize: 18, marginBottom: 6, fontWeight: '700' }}>{label}</Text>
          <Text style={{ color: t.text, fontSize: 17, marginBottom: 12 }}>
            {sides.current.length
              ? 'Now show the other side of the strip.'
              : 'Use a fresh strip if you have one. Hold the printed side up to the camera, any way up.'}
          </Text>
          <View style={{ height: 320, borderRadius: 20, overflow: 'hidden', backgroundColor: '#000' }}>
            {!perm ? null : !perm.granted ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                <Text style={{ color: '#fff', textAlign: 'center', marginBottom: 12 }}>Camera access is needed to scan the strip.</Text>
                <Button title="Allow camera" onPress={requestPerm} />
              </View>
            ) : (
              <CameraView ref={camera} style={{ flex: 1 }} facing="back" flash="off" enableTorch={torch} />
            )}
            {perm?.granted && (
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
                <Text style={{ color: '#fff', marginTop: 8, textAlign: 'center', paddingHorizontal: 16 }}>{progress || 'Reading the strip…'}</Text>
              </View>
            )}
          </View>
          {error && <Text style={{ color: t.bad, marginTop: 10, fontSize: 17 }}>{error}</Text>}
          <Button big title="Read the strip" onPress={read} disabled={busy || !perm?.granted} style={{ marginTop: 12 }} />
          {sides.current.length > 0 && <Button title="Skip — save what was read" kind="ghost" onPress={save} disabled={busy} style={{ marginTop: 10 }} />}
          <More title="Shiny strip?">
            <Text style={{ color: t.sub, fontSize: 16, lineHeight: 22 }}>
              Move away from ceiling lights and windows, and tilt the strip slowly while it takes 3 photos.
            </Text>
          </More>
        </>
      )}

      {!showCamera && check?.kind === 'ok' && (
        <>
          <Card style={{ backgroundColor: t.okFill }}>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>✓ This is {label}</Text>
            <Text style={{ color: '#fff', fontSize: 17, marginTop: 6 }}>
              {check.strengthRead ? 'Name and strength found.' : `Name found. The strength wasn't read — that's fine.`} The scanner will now recognise
              this strip more easily, even when it gets worn.
            </Text>
          </Card>
          <Button big title="Save" onPress={save} disabled={busy} style={{ marginTop: 16 }} />
          {sides.current.length < 2 && <Button title="Also scan the other side" kind="ghost" onPress={again} disabled={busy} style={{ marginTop: 10 }} />}
        </>
      )}

      {!showCamera && check?.kind === 'other' && (
        <>
          <Card style={{ backgroundColor: t.badFill }}>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>This looks like {check.looksLike}</Text>
            <Text style={{ color: '#fff', fontSize: 17, marginTop: 6 }}>Not {label}. Nothing was saved. Check that it's the right strip.</Text>
          </Card>
          <Button big title="Scan again" onPress={again} style={{ marginTop: 16 }} />
        </>
      )}

      {!showCamera && check?.kind === 'unread' && (
        <>
          <Card style={{ backgroundColor: t.warnFill }}>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>{med.name} wasn't found on this strip</Text>
            <Text style={{ color: '#fff', fontSize: 17, marginTop: 6 }}>Try again closer, with less shine, or show the side with the name.</Text>
          </Card>
          <Button big title="Scan again" onPress={again} style={{ marginTop: 16 }} />
          <More title="The name on the strip is different">
            <Text style={{ color: t.sub, fontSize: 16, lineHeight: 22 }}>
              Sometimes the strip shows another name (for example the medicine inside, not the brand). Only save if you are sure this strip is {label}.
            </Text>
            <Button
              title={`It is ${label} — save`}
              kind="ghost"
              onPress={() =>
                Alert.alert(`Save this strip as ${label}?`, 'The scanner will learn this strip as this medicine.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Save', onPress: save },
                ])
              }
            />
          </More>
        </>
      )}
    </ScrollView>
  );
}
