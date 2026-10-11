import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import React from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { setupNotifications } from '../src/notifications.ts';
import { useStore } from '../src/store.tsx';
import type { Settings } from '../src/types.ts';
import { Button, Card, Label, NumberField, s, useTheme } from '../src/ui.tsx';

const ROWS: { key: keyof Settings; label: string; help: string; step: number }[] = [
  { key: 'mealOffsetMin', label: 'Before / after meal (min)', help: '"Before breakfast" = breakfast time minus this.', step: 5 },
  { key: 'dueWindowMin', label: 'Can scan early by (min)', help: 'A dose becomes scannable this long before its time.', step: 15 },
  { key: 'missedAfterMin', label: 'Mark missed after (min)', help: 'Not taken this long after its time → logged as missed.', step: 15 },
  { key: 'followUpMin', label: '"Not taken yet" reminder (min)', help: 'Second reminder if the dose is still open. 0 turns it off.', step: 5 },
  { key: 'snoozeMin', label: 'Snooze (min)', help: 'Used by the Snooze button on a reminder.', step: 5 },
];

export default function SettingsScreen() {
  const t = useTheme();
  const { state, saveSettings } = useStore();

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

      <Label>Reminders</Label>
      <Button title="Send a test reminder" kind="secondary" onPress={test} />
      <Text style={{ color: t.sub, marginTop: 8, fontSize: 13, lineHeight: 18 }}>
        On iPhone, reminders follow your Focus / silent settings. On Android, allow "Alarms & reminders" and turn off battery
        optimisation for MedSync so reminders arrive on time.
      </Text>
    </ScrollView>
  );
}
