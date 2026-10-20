import * as Notifications from 'expo-notifications';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { ageText, backupOverdue } from '../../src/backup.ts';
import { clearSafetyCopy, loadSafetyCopy, pickBackup, saveSafetyCopy, shareBackup } from '../../src/backupFile.ts';
import { DEFAULT_SETTINGS } from '../../src/store.tsx';
import { buildLabel } from '../../src/buildInfo.ts';
import { TRAINING_AVAILABLE } from '../../src/edition.ts';
import { sendForTraining, trainingDestination } from '../../src/sendForTraining.tsx';
import { appleVisionAvailable } from '../../src/ocr.ts';
import { detectorState, loadRegionModel } from '../../src/regionModel.ts';
import { clearTraining, exportTraining, trainingSummary, unmarkAllSent } from '../../src/training.ts';
import { setupNotifications } from '../../src/notifications.ts';
import { useStore } from '../../src/store.tsx';
import { shareHistoryCsv } from '../../src/historyExport.ts';
import { Button, Card, Label, More, NumberField, s, SegmentTabs, useTheme } from '../../src/ui.tsx';

type TimingKey = 'mealOffsetMin' | 'dueWindowMin' | 'missedAfterMin' | 'followUpMin' | 'snoozeMin' | 'testReminderMin';
// Plain words, grouped by what people think about: when doses are, and when reminders come.
const DOSE_ROWS: { key: TimingKey; label: string; help: string; step: number }[] = [
  { key: 'mealOffsetMin', label: '“Before a meal” means', help: 'Minutes before (or after) the meal time.', step: 5 },
  { key: 'dueWindowMin', label: 'A dose can be taken early by', help: 'Minutes before its time.', step: 15 },
  { key: 'missedAfterMin', label: 'Count a dose as missed after', help: 'Minutes after its time.', step: 15 },
];
const REMINDER_ROWS: { key: TimingKey; label: string; help: string; step: number }[] = [
  { key: 'followUpMin', label: 'Remind again if not taken after', help: 'Minutes. 0 = no second reminder.', step: 5 },
  { key: 'snoozeMin', label: 'Snooze for', help: 'Minutes, when you tap Snooze.', step: 5 },
  { key: 'testReminderMin', label: 'Remind to check a new strip', help: 'Minutes before a dose whose strip hasn’t been checked. 0 = off.', step: 15 },
];

type Tab = 'everyday' | 'timing' | 'helper';

export default function SettingsScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'helper' || params.tab === 'timing' ? params.tab : 'everyday');
  // Settings is a tab now and stays mounted, so a link to a section (settings?tab=helper) switches to it.
  useEffect(() => {
    if (params.tab === 'helper' || params.tab === 'timing' || params.tab === 'everyday') setTab(params.tab);
  }, [params.tab]);
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <SegmentTabs<Tab>
        tabs={[
          { key: 'everyday', label: 'Everyday' },
          { key: 'timing', label: 'Timing' },
          { key: 'helper', label: 'Helper tools' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'everyday' && <Everyday />}
      {tab === 'timing' && <Timing />}
      {tab === 'helper' && <Helper />}
      <Text style={{ color: t.sub, textAlign: 'center', marginTop: 28, fontSize: 14 }} selectable>
        TakeSure {buildLabel()}
      </Text>
    </ScrollView>
  );
}

/** What a person may need: who is in the family, a test reminder, a backup, safety information. */
function Everyday() {
  const t = useTheme();
  const { state, saveSettings } = useStore();
  const test = async () => {
    const ok = await setupNotifications();
    if (!ok) return Alert.alert('Reminders are off', 'Turn on notifications for TakeSure in your phone’s Settings.');
    await Notifications.scheduleNotificationAsync({
      content: { title: '💊 Test reminder', body: 'This is how medicine reminders look and sound.', sound: 'default', categoryIdentifier: 'dose' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, channelId: 'medicine-reminders' },
    });
    Alert.alert('Test reminder on its way', 'Lock your phone. It arrives in 5 seconds.');
  };
  return (
    <>
      <Button
        title="Back to the simple view"
        kind="secondary"
        onPress={() => (saveSettings({ ...state.settings, helperView: false }), router.navigate('/'))}
        style={{ marginTop: 14 }}
      />

      <Label>Family</Label>
      <Card>
        {state.members.map((m) => (
          <Pressable accessibilityRole="button" key={m.id} onPress={() => router.push(`/member/${m.id}`)} style={[s.between, { minHeight: 52 }]}>
            <View style={s.row}>
              <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: m.color, marginRight: 10 }} />
              <Text style={{ color: t.text, fontSize: 18, fontWeight: '600' }}>{m.name}</Text>
            </View>
            <Text style={{ color: t.sub, fontSize: 16 }}>
              {state.meds.filter((x) => x.memberId === m.id).length} medicines ›
            </Text>
          </Pressable>
        ))}
        <Button title="+ Add a person" kind="secondary" onPress={() => router.push('/member/new')} style={{ marginTop: 8 }} />
      </Card>

      <Label>Reminders</Label>
      <Card>
        <Button title="Send a test reminder" onPress={test} />
        <Text style={{ color: t.sub, marginTop: 8, fontSize: 15, lineHeight: 21 }}>
          {Platform.OS === 'ios' ? 'Reminders follow your phone’s silent and Focus settings.' : 'Allow “Alarms & reminders” for TakeSure so reminders come on time.'}
        </Text>
      </Card>

      {/* Easy to find: second section, not inside About. */}
      <Label>Help</Label>
      <Button title="Report a problem" kind="secondary" onPress={() => router.push('/report')} />
      <Button title="About & safety" kind="secondary" onPress={() => router.push('/about')} style={{ marginTop: 10 }} />

      <Label>For the doctor</Label>
      <Card>
        <Button title="Share medicine history" kind="secondary" onPress={() => shareHistoryCsv(state, new Date().toISOString().slice(0, 10)).catch((e) => Alert.alert('Could not share', String(e)))} />
        <Text style={{ color: t.sub, marginTop: 8, fontSize: 15, lineHeight: 21 }}>A spreadsheet of every dose taken, missed or skipped, and refills.</Text>
      </Card>

      <BackupCard />


    </>
  );
}

function Timing() {
  const t = useTheme();
  const { state, saveSettings } = useStore();
  const row = (r: (typeof DOSE_ROWS)[number]) => (
    <Card key={r.key} style={{ marginBottom: 10 }}>
      <Text style={{ color: t.text, fontWeight: '700', fontSize: 17 }}>{r.label}</Text>
      <View style={[s.between, { marginTop: 8 }]}>
        <Text style={{ color: t.sub, fontSize: 15, flex: 1, marginRight: 8 }}>{r.help}</Text>
        <NumberField value={state.settings[r.key]} step={r.step} onChange={(v) => saveSettings({ ...state.settings, [r.key]: Math.round(v) })} />
      </View>
    </Card>
  );
  return (
    <>
      <Text style={{ color: t.sub, marginTop: 14, fontSize: 15, lineHeight: 21 }}>These already have sensible values. Change them only if you need to.</Text>
      <Label>Dose times</Label>
      {DOSE_ROWS.map(row)}
      <Label>Reminders</Label>
      {REMINDER_ROWS.map(row)}
    </>
  );
}

/** For a family helper (and the person improving the scanner): checking the scanner, training photos, technical details. */
function Helper() {
  const t = useTheme();
  const { state, saveSettings } = useStore();
  const [summary, setSummary] = useState(() => trainingSummary());
  const [detector, setDetector] = useState(detectorState());
  useEffect(() => {
    loadRegionModel().then(() => setDetector(detectorState()));
  }, []);
  // Scans save photos in the background: recount whenever this tab is shown.
  useFocusEffect(useCallback(() => setSummary(trainingSummary()), []));
  const labelled = summary.photos - summary.unlabelled;
  const toggle = (label: string, value: boolean, onChange: (v: boolean) => void, help?: string) => (
    <View style={{ marginTop: 10 }}>
      <View style={[s.between, { minHeight: 48 }]}>
        <Text style={{ color: t.text, fontWeight: '600', fontSize: 16, flex: 1, marginRight: 10 }}>{label}</Text>
        <Switch value={value} onValueChange={onChange} />
      </View>
      {help ? <Text style={{ color: t.sub, fontSize: 14, lineHeight: 20 }}>{help}</Text> : null}
    </View>
  );
  return (
    <>
      <Text style={{ color: t.sub, marginTop: 14, fontSize: 15, lineHeight: 21 }}>For family helpers. Nothing here is needed for taking medicines.</Text>

      <Label>Check the scanner</Label>
      <Card>
        <Button title="Check the strips" onPress={() => router.push('/test-scan')} />
        <Text style={{ color: t.sub, marginTop: 8, fontSize: 15, lineHeight: 21 }}>Try a strip before its reminder. Nothing is recorded.</Text>
      </Card>

      <Label>Medicine list</Label>
      <Card>
        <Button title="Earlier versions of the list" kind="secondary" onPress={() => router.push('/history')} />
        <Text style={{ color: t.sub, marginTop: 8, fontSize: 15, lineHeight: 21 }}>Every change to the medicines is kept; an earlier list can be brought back.</Text>
      </Card>

      {TRAINING_AVAILABLE && (
        <>
        <Label>Photos for improving the scanner</Label>
        <Card>
          <Text style={{ color: t.text, fontSize: 17, fontWeight: '600' }}>
            {summary.photos ? `${summary.photos} photo${summary.photos === 1 ? '' : 's'} · ${summary.unsent ? `${summary.unsent} not sent` : 'all sent'}` : 'No photos yet'}
          </Text>
          <Button title="Collect strip photos" onPress={() => router.push('/import-photos')} style={{ marginTop: 10 }} />
          <Button title="Send photos" kind="secondary" disabled={!summary.unsent} onPress={() => sendForTraining(() => setSummary(trainingSummary()))} style={{ marginTop: 8 }} />
          <More>
            {toggle('Also keep photos from everyday scans', !!state.settings.collectTraining, (v) => saveSettings({ ...state.settings, collectTraining: v }), 'Each scan keeps 1–3 photos. Off: only photos from Collect strip photos.')}
            <Text style={{ color: t.sub, fontSize: 14 }}>
              {labelled} with a medicine name · {summary.unlabelled} without · sent to {trainingDestination()}
            </Text>
            {summary.photos > summary.unsent && (
              <Button
                title="Didn’t arrive? Send all again"
                kind="secondary"
                onPress={() =>
                  Alert.alert('Send all again?', 'All photos will count as not sent, so the next Send includes them.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Yes', onPress: () => (unmarkAllSent(), setSummary(trainingSummary())) },
                  ])
                }
              />
            )}
            <Button title="Save as a file (.zip)" kind="secondary" disabled={!summary.photos} onPress={() => exportTraining().catch((e) => Alert.alert('Could not save', String(e)))} />
            <Button
              title="Delete all photos"
              kind="ghost"
              disabled={!summary.photos}
              onPress={() =>
                Alert.alert('Delete all photos?', 'This cannot be undone.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => (clearTraining(), setSummary(trainingSummary())) },
                ])
              }
            />
          </More>
        </Card>
        </>
      )}

      <Label>Scanner details</Label>
      <Card>
        <Text style={{ color: t.text, fontSize: 15, lineHeight: 21 }}>
          Text reader: {appleVisionAvailable() ? 'Apple Vision (ML Kit as backup)' : 'Google ML Kit'}
          {'\n'}Strip area finder (trial):{' '}
          {detector === 'missing' ? 'not in this build' : state.settings.regionDetector === false ? 'off' : detector === 'ready' ? 'on' : 'loading'}
        </Text>
        <More title="Change">
          {toggle('Use the strip area finder', state.settings.regionDetector !== false, (v) => saveSettings({ ...state.settings, regionDetector: v }), 'Trial model that finds the name and strength first. Off: read the whole photo every way up.')}
          {toggle('Read strips by themselves', state.settings.autoScan !== false, (v) => saveSettings({ ...state.settings, autoScan: v }), 'On the Scan tab, reads a strip as soon as it is held still in view. Off: press Read strip name.')}
          {toggle('Show scanner details on scan results', !!state.settings.showScanDetails, (v) => saveSettings({ ...state.settings, showScanDetails: v }), 'Adds a small line saying how each scan was read.')}
        </More>
      </Card>
    </>
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
        <Text style={{ color: overdue ? t.warn : t.text, fontWeight: '700', fontSize: 17 }}>
          {overdue ? 'No backup for 30+ days' : 'Last backup: '}
          {overdue ? '' : ageText(state.settings.lastBackupAt)}
        </Text>
        <Text style={{ color: t.sub, marginTop: 6, fontSize: 15, lineHeight: 21 }}>
          Saves all medicines and history to one small file. Keep it somewhere private, like your email or Google Drive.
        </Text>
        <Button title="Save a backup" onPress={save} style={{ marginTop: 10 }} />
        <More title="Restore from a backup">
          <Text style={{ color: t.sub, fontSize: 14, lineHeight: 20 }}>For a new phone. It replaces what is on this phone; you can undo it once.</Text>
          <Button title="Restore…" kind="secondary" onPress={restore} />
          {safety ? <Button title="Undo last restore" kind="ghost" onPress={undo} /> : null}
        </More>
      </Card>
    </>
  );
}
