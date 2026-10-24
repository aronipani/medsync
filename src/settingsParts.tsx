// Pieces of the Settings pages (spec 21). Each page in app/(tabs) puts the ones it needs together.
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, Switch, Text, View } from 'react-native';
import { ageText, backupOverdue } from './backup.ts';
import { clearSafetyCopy, loadSafetyCopy, pickBackup, saveSafetyCopy, shareBackup } from './backupFile.ts';
import { DEFAULT_SETTINGS } from './store.tsx';
import { TRAINING_AVAILABLE } from './edition.ts';
import { sendForTraining, trainingDestination } from './sendForTraining.tsx';
import { appleVisionAvailable } from './ocr.ts';
import { detectorState, loadRegionModel } from './regionModel.ts';
import { clearTraining, exportTraining, trainingSummary, unmarkAllSent } from './training.ts';
import { setupNotifications } from './notifications.ts';
import { useStore } from './store.tsx';
import { DoseScanDisclosure } from './components/DoseScanSwitch.tsx';
import { doseScanOn, DOSE_SCAN_DISCLOSURE_VERSION, setUpInUS } from './doseScan.ts';
import { shareHistoryCsv } from './historyExport.ts';
import { Button, Card, Label, More, NumberField, s, useTheme } from './ui.tsx';

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


/** A row on a settings page: a title, an optional line under it, and a switch. */
export function Toggle({ label, value, onChange, help }: { label: string; value: boolean; onChange: (v: boolean) => void; help?: string }) {
  const t = useTheme();
  return (
    <View style={{ marginTop: 10 }}>
      <View style={[s.between, { minHeight: 48 }]}>
        <Text style={{ color: t.text, fontWeight: '600', fontSize: 16, flex: 1, marginRight: 10 }}>{label}</Text>
        <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
      </View>
      {help ? <Text style={{ color: t.sub, fontSize: 14, lineHeight: 20 }}>{help}</Text> : null}
    </View>
  );
}

export function Help({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text style={{ color: t.sub, marginTop: 8, fontSize: 15, lineHeight: 21 }}>{children}</Text>;
}

/** Same words wherever data can leave the phone (spec 21), linking to Privacy & safety. */
export function LockNote({ text = 'Contains health information. It goes only where you send it.' }: { text?: string }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push('/privacy')} style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 8, gap: 6 }}>
      <Ionicons name="lock-closed-outline" size={16} color={t.sub} style={{ marginTop: 2 }} />
      <Text style={{ color: t.sub, fontSize: 14, lineHeight: 20, flex: 1 }}>
        {text} <Text style={{ textDecorationLine: 'underline' }}>Privacy</Text>
      </Text>
    </Pressable>
  );
}

export function TestReminderCard() {
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
    <Card>
      <Button title="Send a test reminder" onPress={test} />
      <Help>
        {Platform.OS === 'ios'
          ? 'Reminders follow your phone’s silent and Focus settings. Spoken scan results play even in silent mode.'
          : 'Allow “Alarms & reminders” for TakeSure and turn off battery optimisation, so reminders come on time.'}
      </Help>
    </Card>
  );
}

/** The timing values (they have sensible defaults): "Fine-tune" under Reminders. */
export function FineTune() {
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
      <Text style={{ color: t.sub, marginBottom: 8, fontSize: 15, lineHeight: 21 }}>These already have sensible values. Change them only if you need to.</Text>
      <Label>Dose times</Label>
      {DOSE_ROWS.map(row)}
      <Label>Reminders</Label>
      {REMINDER_ROWS.map(row)}
    </>
  );
}

export function CheckStripsCard() {
  return (
    <Card>
      <Button title="Check the strips" onPress={() => router.push('/test-scan')} />
      <Help>Try a strip before its reminder. Nothing is recorded.</Help>
    </Card>
  );
}

export function DoctorHistoryCard() {
  const { state } = useStore();
  return (
    <Card>
      <Button
        title="Share medicine history"
        kind="secondary"
        onPress={() => shareHistoryCsv(state, new Date().toISOString().slice(0, 10)).catch((e) => Alert.alert('Could not share', String(e)))}
      />
      <Help>A spreadsheet of every dose taken, missed or skipped, and refills — for the doctor.</Help>
      <LockNote />
    </Card>
  );
}

export function TrainingPhotosCard() {
  const t = useTheme();
  const { state, saveSettings } = useStore();
  const [summary, setSummary] = useState(() => trainingSummary());
  // Scans save photos in the background: recount whenever the page is shown.
  useFocusEffect(useCallback(() => setSummary(trainingSummary()), []));
  const labelled = summary.photos - summary.unlabelled;
  if (!TRAINING_AVAILABLE) return null;
  return (
    <Card>
      <Text style={{ color: t.text, fontSize: 17, fontWeight: '600' }}>
        {summary.photos ? `${summary.photos} photo${summary.photos === 1 ? '' : 's'} · ${summary.unsent ? `${summary.unsent} not sent` : 'all sent'}` : 'No photos yet'}
      </Text>
      <Button title="Collect strip photos" onPress={() => router.push('/import-photos')} style={{ marginTop: 10 }} />
      <Button title="Send photos" kind="secondary" disabled={!summary.unsent} onPress={() => sendForTraining(() => setSummary(trainingSummary()))} style={{ marginTop: 8 }} />
      <LockNote text="Photos of strips, sent only when you press Send." />
      <More>
        <Toggle
          label="Also keep photos from everyday scans"
          value={!!state.settings.collectTraining}
          onChange={(v) => saveSettings({ ...state.settings, collectTraining: v })}
          help="Each scan keeps 1–3 photos. Off: only photos from Collect strip photos."
        />
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
  );
}

export function ScannerDetailsCard() {
  const t = useTheme();
  const { state, saveSettings } = useStore();
  const [detector, setDetector] = useState(detectorState());
  useEffect(() => {
    loadRegionModel().then(() => setDetector(detectorState()));
  }, []);
  return (
    <Card>
      <Text style={{ color: t.text, fontSize: 15, lineHeight: 21 }}>
        Text reader: {appleVisionAvailable() ? 'Apple Vision (ML Kit as backup)' : 'Google ML Kit'}
        {'\n'}Strip area finder (trial):{' '}
        {detector === 'missing' ? 'not in this build' : state.settings.regionDetector === false ? 'off' : detector === 'ready' ? 'on' : 'loading'}
      </Text>
      <More title="Change">
        <Toggle label="Use the strip area finder" value={state.settings.regionDetector !== false} onChange={(v) => saveSettings({ ...state.settings, regionDetector: v })} help="Trial model that finds the name and strength first. Off: read the whole photo every way up." />
        <Toggle label="Show scanner details on scan results" value={!!state.settings.showScanDetails} onChange={(v) => saveSettings({ ...state.settings, showScanDetails: v })} help="Adds a small line saying how each scan was read." />
      </More>
    </Card>
  );
}

export function AutoScanToggle() {
  const { state, saveSettings } = useStore();
  return (
    <Toggle
      label="Read strips by themselves"
      value={state.settings.autoScan !== false}
      onChange={(v) => saveSettings({ ...state.settings, autoScan: v })}
      help="On the Scan tab, reads a strip as soon as it is held still in view. Off: press Read strip name."
    />
  );
}

export function BackupCard() {
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
              // What this phone agreed to, and where it was set up (US scanning default), belong to this phone.
              const mine = state.settings;
              replaceAll({ ...r.state, settings: { ...r.state.settings, acceptedNotice: mine.acceptedNotice, acceptedNoticeAt: mine.acceptedNoticeAt, setupInUS: mine.setupInUS } });
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
      <Card>
        <Text style={{ color: overdue ? t.warn : t.text, fontWeight: '700', fontSize: 17 }}>
          {overdue ? 'No backup for 30+ days' : 'Last backup: '}
          {overdue ? '' : ageText(state.settings.lastBackupAt)}
        </Text>
        <Text style={{ color: t.sub, marginTop: 6, fontSize: 15, lineHeight: 21 }}>
          Saves all medicines and history to one small file. Keep it somewhere private, like your email or Google Drive.
        </Text>
        <Button title="Save a backup" onPress={save} style={{ marginTop: 10 }} />
        <LockNote />
        <More title="Restore from a backup">
          <Text style={{ color: t.sub, fontSize: 14, lineHeight: 20 }}>For a new phone. It replaces what is on this phone; you can undo it once.</Text>
          <Button title="Restore…" kind="secondary" onPress={restore} />
          {safety ? <Button title="Undo last restore" kind="ghost" onPress={undo} /> : null}
        </More>
      </Card>
    </>
  );
}

/** The dose-time scan check: on by default except in the US, where it is turned on only after the disclosure (spec 19). */
export function DoseScanSetting() {
  const t = useTheme();
  const { state, saveSettings } = useStore();
  const on = doseScanOn(state.settings);
  const us = setUpInUS(state.settings);
  const [asking, setAsking] = useState(false);
  const c = state.settings.doseScan;
  return (
    <>
      <View style={[s.between, { minHeight: 48 }]}>
        <Text style={{ color: t.text, fontWeight: '600', fontSize: 16, flex: 1, marginRight: 10 }}>Check the strip with a scan when a dose is due</Text>
        <Switch
          accessibilityLabel="Check the strip with a scan when a dose is due"
          value={on || asking}
          onValueChange={(v) => {
            if (!v) {
              setAsking(false);
              saveSettings({ ...state.settings, doseScan: { on: false, at: new Date().toISOString(), disclosure: c?.disclosure } });
            } else if (us && (c?.disclosure ?? 0) < DOSE_SCAN_DISCLOSURE_VERSION) setAsking(true);
            else saveSettings({ ...state.settings, doseScan: { on: true, at: new Date().toISOString(), disclosure: c?.disclosure } });
          }}
        />
      </View>
      <Text style={{ color: t.sub, fontSize: 14, lineHeight: 20 }}>
        {on
          ? 'Off: doses are marked as taken on the Today tab instead. Adding medicines by scanning works either way.'
          : us
            ? 'Off when TakeSure is set up in the US, unless you turn it on. Doses are marked as taken on the Today tab.'
            : 'Doses are marked as taken on the Today tab.'}
        {c?.on && c.disclosure ? ` You read the notice on ${new Date(c.at).toLocaleDateString()}.` : ''}
      </Text>
      {asking && !on && <DoseScanDisclosure onDone={() => setAsking(false)} />}
    </>
  );
}
