import * as Notifications from 'expo-notifications';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { ageText, backupOverdue } from '../src/backup.ts';
import { clearSafetyCopy, loadSafetyCopy, pickBackup, saveSafetyCopy, shareBackup } from '../src/backupFile.ts';
import { DEFAULT_SETTINGS } from '../src/store.tsx';
import { buildLabel } from '../src/buildInfo.ts';
import { appleVisionAvailable } from '../src/ocr.ts';
import { detectorState, loadRegionModel } from '../src/regionModel.ts';
import { clearTraining, emailTraining, exportTraining, TRAINING_EMAIL, trainingSummary } from '../src/training.ts';
import { setupNotifications } from '../src/notifications.ts';
import { useStore } from '../src/store.tsx';
import type { Settings } from '../src/types.ts';
import { Button, Card, Label, NumberField, s, useTheme } from '../src/ui.tsx';

const ROWS: { key: Exclude<keyof Settings, 'collectTraining' | 'regionDetector' | 'lastBackupAt' | 'acceptedNotice'>; label: string; help: string; step: number }[] = [
  { key: 'mealOffsetMin', label: 'Before / after meal (min)', help: '"Before breakfast" = breakfast time minus this.', step: 5 },
  { key: 'dueWindowMin', label: 'Can scan early by (min)', help: 'A dose becomes scannable this long before its time.', step: 15 },
  { key: 'missedAfterMin', label: 'Mark missed after (min)', help: 'Not taken this long after its time → logged as missed.', step: 15 },
  { key: 'followUpMin', label: '"Not taken yet" reminder (min)', help: 'Second reminder if the dose is still open. 0 turns it off.', step: 5 },
  { key: 'snoozeMin', label: 'Snooze (min)', help: 'Used by the Snooze button on a reminder.', step: 5 },
  {
    key: 'testReminderMin',
    label: 'Test-scan reminder (min before)',
    help: 'If a medicine in the next dose hasn\'t passed a test scan, a reminder to test it comes this long before. 0 turns it off.',
    step: 15,
  },
];

export default function SettingsScreen() {
  const t = useTheme();
  const { state, saveSettings } = useStore();
  const [summary, setSummary] = useState(() => trainingSummary());
  const [detector, setDetector] = useState(detectorState());
  useEffect(() => {
    loadRegionModel().then(() => setDetector(detectorState()));
  }, []);
  // Scans save photos in the background: recount whenever Settings is opened, not only when it first loads.
  useFocusEffect(useCallback(() => setSummary(trainingSummary()), []));

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

      <BackupCard />

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

      <Label>Strip reading</Label>
      <Card>
        <View style={s.between}>
          <Text style={{ color: t.text, fontWeight: '600', flex: 1 }}>Use the region detector</Text>
          <Switch value={state.settings.regionDetector !== false} onValueChange={(v) => saveSettings({ ...state.settings, regionDetector: v })} />
        </View>
        <Text style={{ color: t.sub, marginTop: 6, fontSize: 13, lineHeight: 18 }}>
          Finds the name, strength and expiry on a strip and reads just those parts. Trial model — turn off to compare with the old method
          (reading the whole photo every way up). If it finds nothing, the old method is used anyway.
        </Text>
        <Button title="Test scan" kind="secondary" onPress={() => router.push('/test-scan')} style={{ marginTop: 10 }} />
      </Card>

      <Label>Training photos</Label>
      <Card>
        <View style={s.between}>
          <Text style={{ color: t.text, fontWeight: '600', flex: 1 }}>Save scan photos for training</Text>
          <Switch value={!!state.settings.collectTraining} onValueChange={(v) => saveSettings({ ...state.settings, collectTraining: v })} />
        </View>
        <Text style={{ color: t.sub, marginTop: 6, fontSize: 13, lineHeight: 18 }}>
          When a scan is confirmed (or taught), its photos are kept on this phone, labelled with the medicine, to train a strip-recognition model later.
          Scans that end red, can't be read or are closed are kept too, without a label — they are the strips the app finds hardest.
          Nothing is uploaded. Photos may show hands or surroundings.
        </Text>
        <Text style={{ color: t.text, marginTop: 10 }}>
          {summary.photos - summary.unlabelled} photo{summary.photos - summary.unlabelled === 1 ? '' : 's'} of {summary.medicines} medicine{summary.medicines === 1 ? '' : 's'}
          {summary.unlabelled ? ` · ${summary.unlabelled} from failed scans` : ''} saved
          {summary.photos ? ` · ${summary.unsent ? `${summary.unsent} not sent yet` : 'all sent'}` : ''}
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
        <Button
          title="Send for training (email)"
          style={{ marginTop: 10 }}
          disabled={!summary.unsent}
          onPress={() =>
            emailTraining(buildLabel())
              .then((r) => {
                setSummary(trainingSummary());
                if (r.kind === 'no-mail')
                  Alert.alert('No email account', `Set up Mail on this phone, or use Export and send the zip to ${TRAINING_EMAIL} another way.`, [
                    { text: 'OK', style: 'cancel' },
                    { text: 'Export instead', onPress: () => exportTraining().catch(() => {}) },
                  ]);
                else if ((r.kind === 'sent' || r.kind === 'opened') && r.left)
                  Alert.alert('More to send', `${r.photos} photos went in this email. ${r.left} more — tap "Send for training" again.`);
              })
              .catch((e) => Alert.alert('Could not open email', String(e)))
          }
        />
        <Text style={{ color: t.sub, marginTop: 6, fontSize: 13 }}>Opens an email to {TRAINING_EMAIL} with the photos not sent before. You press Send.</Text>
        <Button title="Refresh count" kind="ghost" onPress={() => setSummary(trainingSummary())} />
      </Card>

      <Label>About</Label>
      <Button title="About & safety · privacy" kind="secondary" onPress={() => router.push('/about')} />
      <Text style={{ color: t.sub, textAlign: 'center', marginTop: 8, fontSize: 13 }} selectable>
        Version {buildLabel()}
      </Text>
      <Text style={{ color: t.sub, textAlign: 'center', marginTop: 4, fontSize: 13 }}>
        Text reader: {appleVisionAvailable() ? 'Apple Vision (ML Kit as backup)' : 'Google ML Kit'} · Region detector:{' '}
        {detector === 'missing' ? 'not in this build' : state.settings.regionDetector === false ? 'off' : detector === 'ready' ? 'on' : 'loading'}
      </Text>

      <Label>Reminders</Label>
      <Button title="Send a test reminder" kind="secondary" onPress={test} />
      <Text style={{ color: t.sub, marginTop: 8, fontSize: 13, lineHeight: 18 }}>
        On iPhone, reminders follow your Focus / silent settings. On Android, allow "Alarms & reminders" and turn off battery
        optimisation for MedSync so reminders arrive on time.
      </Text>
    </ScrollView>
  );
}

function BackupCard() {
  const t = useTheme();
  const { state, saveSettings, replaceAll } = useStore();
  const [safety, setSafety] = useState<string | undefined>();
  useEffect(() => {
    loadSafetyCopy().then((c) => setSafety(c?.at)).catch(() => {});
  }, []);
  const overdue = backupOverdue(state);
  const dateText = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

  const save = async () => {
    try {
      if (await shareBackup(state)) saveSettings({ ...state.settings, lastBackupAt: new Date().toISOString() });
    } catch (e) {
      Alert.alert('Backup failed', String(e instanceof Error ? e.message : e));
    }
  };

  const restore = async () => {
    try {
      const r = await pickBackup(DEFAULT_SETTINGS);
      if (!r) return;
      if (!r.ok) return Alert.alert('Cannot restore', r.error);
      const { members, medicines, logs } = r.summary;
      const from = r.exportedAt ? `Backup from ${dateText(r.exportedAt)}` : 'This backup';
      const dropped = r.droppedMeds ? `\n${r.droppedMeds} medicine${r.droppedMeds === 1 ? '' : 's'} without a family member will be left out.` : '';
      Alert.alert(
        'Restore this backup?',
        `${from}: ${members} ${members === 1 ? 'person' : 'people'}, ${medicines} medicine${medicines === 1 ? '' : 's'}, ${logs} dose record${logs === 1 ? '' : 's'}.${dropped}\n\nThis replaces everything on this phone. You can undo it once.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Replace',
            style: 'destructive',
            onPress: async () => {
              try {
                await saveSafetyCopy(state);
              } catch (e) {
                return Alert.alert('Cannot restore', `Couldn't keep a safety copy of the current data first, so nothing was changed. (${String(e)})`);
              }
              replaceAll(r.state);
              setSafety(new Date().toISOString());
              Alert.alert('Restored', 'Your medicines and reminders are back.');
            },
          },
        ],
      );
    } catch (e) {
      Alert.alert('Cannot restore', String(e instanceof Error ? e.message : e));
    }
  };

  const undo = async () => {
    const c = await loadSafetyCopy().catch(() => undefined);
    if (!c) return setSafety(undefined);
    Alert.alert(
      'Undo the last restore?',
      `Puts back what was on this phone before the restore on ${dateText(c.at)}. Anything recorded since then (doses, changes) will be lost.`,
      [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Undo restore',
        style: 'destructive',
        onPress: async () => {
          replaceAll(c.state);
          await clearSafetyCopy();
          setSafety(undefined);
        },
      },
      ],
    );
  };

  return (
    <>
      <Label>Backup</Label>
      <Card>
        <Text style={{ color: overdue ? t.warn : t.text, fontWeight: '600' }}>
          {overdue ? 'No backup for 30+ days' : 'Last backup: '}
          {overdue ? '' : ageText(state.settings.lastBackupAt)}
        </Text>
        <Text style={{ color: t.sub, marginTop: 6, fontSize: 13, lineHeight: 18 }}>
          Saves everyone's medicines, schedules and history to one small file. Keep it in Google Drive, email or WhatsApp to
          yourself, and restore it on a new phone. Photos are not included. The file contains health information — keep it private.
        </Text>
        <View style={[s.row, { gap: 8, marginTop: 10 }]}>
          <Button title="Save a backup" style={{ flex: 1 }} onPress={save} />
          <Button title="Restore…" kind="secondary" style={{ flex: 1 }} onPress={restore} />
        </View>
        {safety ? <Button title="Undo last restore" kind="ghost" onPress={undo} style={{ marginTop: 4 }} /> : null}
      </Card>
    </>
  );
}
