import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { clearTraining, exportTraining, trainingSummary } from '../src/training.ts';
import { setupNotifications } from '../src/notifications.ts';
import { useStore } from '../src/store.tsx';
import type { Settings } from '../src/types.ts';
import { Button, Card, Label, NumberField, s, useTheme } from '../src/ui.tsx';

const ROWS: { key: Exclude<keyof Settings, 'collectTraining'>; label: string; help: string; step: number }[] = [
  { key: 'mealOffsetMin', label: 'Before / after meal (min)', help: '"Before breakfast" = breakfast time minus this.', step: 5 },
  { key: 'dueWindowMin', label: 'Can scan early by (min)', help: 'A dose becomes scannable this long before its time.', step: 15 },
  { key: 'missedAfterMin', label: 'Mark missed after (min)', help: 'Not taken this long after its time → logged as missed.', step: 15 },
  { key: 'followUpMin', label: '"Not taken yet" reminder (min)', help: 'Second reminder if the dose is still open. 0 turns it off.', step: 5 },
  { key: 'snoozeMin', label: 'Snooze (min)', help: 'Used by the Snooze button on a reminder.', step: 5 },
];

export default function SettingsScreen() {
  const t = useTheme();
  const { state, saveSettings } = useStore();
  const [summary, setSummary] = useState(() => trainingSummary());

  const test = async () => {
    const ok = await setupNotifications();
    if (!ok) return Alert.alert('Notifications are off', 'Turn on notifications for MedSync in your phone settings.');
    await Notifications.scheduleNotificationAsync({
      content: { title: '💊 Test reminder', body: 'This is how medicine reminders will look and sound.', sound: 'default', categoryIdentifier: 'dose' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, channelId: 'medicine-reminders' },
    });
    Alert.alert('Test scheduled', 'Lock your phone — the reminder arrives in 5 seconds.');
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <Label>Family</Label>
      <Card>
        {state.members.map((m) => (
          <Pressable key={m.id} onPress={() => router.push(`/member/${m.id}`)} style={[s.between, { paddingVertical: 8 }]}>
            <View style={s.row}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: m.color, marginRight: 8 }} />
              <Text style={{ color: t.text, fontSize: 16 }}>{m.name}</Text>
            </View>
            <Text style={{ color: t.sub }}>{state.meds.filter((x) => x.memberId === m.id).length} medicines ›</Text>
          </Pressable>
        ))}
        <Button title="+ Add family member" kind="secondary" onPress={() => router.push('/member/new')} style={{ marginTop: 8 }} />
      </Card>

      <Label>Timing</Label>
      {ROWS.map((r) => (
        <Card key={r.key} style={{ marginBottom: 8 }}>
          <View style={s.between}>
            <Text style={{ color: t.text, fontWeight: '600', flex: 1 }}>{r.label}</Text>
            <NumberField value={state.settings[r.key]} step={r.step} onChange={(v) => saveSettings({ ...state.settings, [r.key]: Math.round(v) })} />
          </View>
          <Text style={{ color: t.sub, marginTop: 6, fontSize: 13 }}>{r.help}</Text>
        </Card>
      ))}

      <Label>Training photos</Label>
      <Card>
        <View style={s.between}>
          <Text style={{ color: t.text, fontWeight: '600', flex: 1 }}>Save confirmed scan photos</Text>
          <Switch value={!!state.settings.collectTraining} onValueChange={(v) => saveSettings({ ...state.settings, collectTraining: v })} />
        </View>
        <Text style={{ color: t.sub, marginTop: 6, fontSize: 13, lineHeight: 18 }}>
          When a scan is confirmed (or taught), its photos are kept on this phone, labelled with the medicine, to train a strip-recognition model later.
          Nothing is uploaded. Photos may show hands or surroundings.
        </Text>
        <Text style={{ color: t.text, marginTop: 10 }}>
          {summary.photos} photo{summary.photos === 1 ? '' : 's'} of {summary.medicines} medicine{summary.medicines === 1 ? '' : 's'} saved
        </Text>
        <View style={[s.row, { gap: 8, marginTop: 10 }]}>
          <Button
            title="Export (.zip)"
            kind="secondary"
            style={{ flex: 1 }}
            disabled={!summary.photos}
            onPress={() => exportTraining().catch((e) => Alert.alert('Export failed', String(e)))}
          />
          <Button
            title="Delete all"
            kind="ghost"
            style={{ flex: 1 }}
            disabled={!summary.photos}
            onPress={() =>
              Alert.alert('Delete all training photos?', 'This cannot be undone.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => (clearTraining(), setSummary(trainingSummary())) },
              ])
            }
          />
        </View>
        <Button title="Refresh count" kind="ghost" onPress={() => setSummary(trainingSummary())} />
      </Card>

      <Label>Reminders</Label>
      <Button title="Send a test reminder" kind="secondary" onPress={test} />
      <Text style={{ color: t.sub, marginTop: 8, fontSize: 13, lineHeight: 18 }}>
        On iPhone, reminders follow your Focus / silent settings. On Android, allow "Alarms & reminders" and turn off battery
        optimisation for MedSync so reminders arrive on time.
      </Text>
    </ScrollView>
  );
}
