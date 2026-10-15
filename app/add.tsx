import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { MemberPicker } from '../src/components.tsx';
import { mergeRows } from '../src/label.ts';
import { isNotLinkedError, readPage } from '../src/ocr.ts';
import { parsePrescription } from '../src/rx.ts';
import { sameMedicine, strengthKey } from '../src/consolidate.ts';
import { uid, useStore } from '../src/store.tsx';
import { addDays, dateKey } from '../src/time.ts';
import type { Medication, PendingRxItem } from '../src/types.ts';
import { Card, Label, s, useTheme } from '../src/ui.tsx';

export default function AddMedicine() {
  const t = useTheme();
  const params = useLocalSearchParams<{ memberId?: string }>();
  const { state, setPending } = useStore();
  const [memberId, setMemberId] = useState<string | undefined>(params.memberId ?? state.members[0]?.id);
  const [busy, setBusy] = useState(false);

  const readPrescription = async (from: 'camera' | 'library') => {
    if (!memberId) return;
    if (from === 'camera') {
      const p = await ImagePicker.requestCameraPermissionsAsync();
      if (!p.granted) return Alert.alert('Camera access needed', 'Allow camera access in Settings to photograph the prescription.');
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsMultipleSelection: from === 'library', selectionLimit: 4 };
    const res = from === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets.length) return;

    setBusy(true);
    try {
      const rows: string[] = [];
      const found = (lines: Parameters<typeof mergeRows>[0]) => parsePrescription(mergeRows(lines), () => 'x').length;
      for (const a of res.assets) rows.push(...mergeRows((await readPage(a.uri, found)).lines));
      const drafts = parsePrescription(rows, uid);
      if (!drafts.length) {
        const read = rows.filter((r) => r.trim()).slice(0, 12).join('\n');
        Alert.alert(
          'No medicines found',
          (read
            ? 'The app could not find medicine lines (like "Tab. Dolo 650 1-0-1" or "7:00 AM  Thyroxin 50 mcg"). Handwritten prescriptions usually can\'t be read — add those medicines with Scan or Type instead.'
            : 'No text could be read from this photo. Try again in good light, with the whole page flat and in the frame.') +
            (read ? `\n\nWhat the phone read:\n${read}` : ''),
        );
        return;
      }
      const now = new Date();
      const items: PendingRxItem[] = drafts.map((d) => {
        const med: Medication = {
          id: uid(),
          memberId,
          name: d.name,
          strength: d.strength,
          aliases: d.aliases,
          barcodes: d.barcodes,
          unit: d.unit,
          doses: d.doses.map((x) => ({ id: uid(), timing: x.timing, qty: x.qty, days: x.days, since: now.toISOString() })),
          stock: 0,
          lowStockAt: 5,
          endDate: d.durationDays ? dateKey(addDays(now, d.durationDays - 1)) : undefined,
          notes: [d.asNeeded ? 'Take only when needed (SOS).' : '', d.notes ?? ''].filter(Boolean).join(' ') || undefined,
          active: true,
          createdAt: now.toISOString(),
        };
        return { id: d.id, med, source: d.source, warnings: d.warnings, checked: false, include: true, asNeeded: d.asNeeded };
      });
      // The same medicine on two pages (or twice on one) becomes one item with all its times.
      const merged: PendingRxItem[] = [];
      for (const it of items) {
        const same = merged.find((x) => sameMedicine(x.med, it.med) && strengthKey(x.med.strength) === strengthKey(it.med.strength));
        if (!same) {
          merged.push(it);
          continue;
        }
        const key = (d: (typeof it.med.doses)[number]) => JSON.stringify([d.timing, d.days]);
        same.med = {
          ...same.med,
          doses: [...same.med.doses, ...it.med.doses.filter((d) => !same.med.doses.some((x) => key(x) === key(d)))],
          aliases: [...new Set([...same.med.aliases, ...it.med.aliases])],
          notes: [same.med.notes, it.med.notes].filter((n, i, a) => n && a.indexOf(n) === i).join(' ') || undefined,
        };
        same.source = `${same.source}\n${it.source}`;
        same.warnings = [...new Set([...same.warnings, ...it.warnings])];
      }
      setPending({ id: uid(), memberId, imageUris: res.assets.map((a) => a.uri), createdAt: now.toISOString(), items: merged });
      router.replace('/rx-review');
    } catch (e) {
      Alert.alert(
        'Could not read the prescription',
        isNotLinkedError(e) ? 'Reading text needs the installed app build (not Expo Go).' : 'Try a clearer, well-lit photo taken straight on.',
      );
    } finally {
      setBusy(false);
    }
  };

  const Option = ({ icon, title, body, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string; onPress: () => void }) => (
    <Pressable onPress={onPress} disabled={busy}>
      <Card style={{ marginBottom: 10, flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: t.brandSoft, alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
          <Ionicons name={icon} size={24} color={t.brand} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>{title}</Text>
          <Text style={{ color: t.sub, marginTop: 2 }}>{body}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={t.sub} />
      </Card>
    </Pressable>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'Add medicine' }} />
      {state.members.length > 1 && (
        <>
          <Label>For</Label>
          <MemberPicker value={memberId} onChange={(v) => v && setMemberId(v)} />
        </>
      )}

      <Label>One medicine</Label>
      <Option
        icon="scan-outline"
        title="Scan strip, bottle or box"
        body="Reads the name, strength and barcode. You then set when to take it."
        onPress={() => router.replace({ pathname: '/scan-add', params: { memberId } })}
      />
      <Option
        icon="create-outline"
        title="Type it in"
        body="Enter the name and times yourself."
        onPress={() => router.replace({ pathname: '/med/[id]', params: { id: 'new', memberId } })}
      />

      <Label>Whole prescription</Label>
      <Option icon="camera-outline" title="Photograph prescription" body="Drafts the schedule. You check every medicine before it's added." onPress={() => readPrescription('camera')} />
      <Option icon="images-outline" title="Choose prescription photo" body="From your photos — up to 4 pages." onPress={() => readPrescription('library')} />
      <Text style={{ color: t.sub, fontSize: 13, lineHeight: 18, marginTop: 4 }}>
        Works best with printed prescriptions. Text is read on this phone — nothing is uploaded. Handwriting often can't be read; add those medicines one at a time.
      </Text>

      {busy && (
        <View style={[s.row, { marginTop: 20, justifyContent: 'center' }]}>
          <ActivityIndicator color={t.brand} />
          <Text style={{ color: t.text, marginLeft: 10 }}>Reading prescription…</Text>
        </View>
      )}
    </ScrollView>
  );
}
