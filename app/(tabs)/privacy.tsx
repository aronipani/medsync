import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import React from 'react';
import { Alert, Linking, Platform, ScrollView, Text, View } from 'react-native';
import { clearSafetyCopy } from '../../src/backupFile.ts';
import { MEDICINES } from '../../src/data/medicines.ts';
import { DOSE_SCAN_DISCLOSURE, doseScanOn, setUpInUS } from '../../src/doseScan.ts';
import { DRUGS } from '../../src/drugdb.ts';
import { TRAINING_AVAILABLE } from '../../src/edition.ts';
import { dataPoints, NOTICE_VERSION, PRIVACY_HEADLINE, PRIVACY_URL, SAFETY_HEADLINE, SAFETY_POINTS, TERMS_POINTS, TERMS_URL, TERMS_VERSION } from '../../src/legal.ts';
import { deleteReferences } from '../../src/profileFiles.ts';
import { DEFAULT_SETTINGS, newMember, useStore } from '../../src/store.tsx';
import { clearTraining } from '../../src/training.ts';
import { usListBuilt } from '../../src/usLookup.ts';
import { Button, Card, Label, More, useTheme } from '../../src/ui.tsx';

/**
 * Privacy & safety, all in one place (spec 21): what TakeSure is, where the data is and every way it can leave,
 * what the person has agreed to (with dates, and how to undo it), the medicine lists, and deleting everything.
 */
export default function PrivacyPage() {
  const t = useTheme();
  const { state, saveSettings, replaceAll } = useStore();
  const st = state.settings;
  const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const bullet = (x: string) => (
    <View key={x} style={{ flexDirection: 'row', marginTop: 8 }}>
      <Text style={{ color: t.text, fontSize: 16, width: 18 }}>•</Text>
      <Text style={{ color: t.text, fontSize: 16, lineHeight: 23, flex: 1 }}>{x}</Text>
    </View>
  );
  const leaves = [
    { what: 'A backup file', how: 'Everything except photos, to wherever you save it.', where: 'Settings → Your data', go: '/data' },
    { what: "Sending a person's medicines", how: 'Their medicines, times and recent doses, to whoever you send it.', where: 'Settings → Family', go: '/family' },
    { what: 'A problem report', how: 'An email with what you typed and chose to include.', where: 'Settings → Help', go: '/help' },
    { what: 'Medicine history for the doctor', how: 'A spreadsheet of doses and refills, to whoever you send it.', where: 'Settings → Your data', go: '/data' },
    ...(TRAINING_AVAILABLE ? [{ what: 'Training photos (test builds)', how: 'Photos of strips, only when you press Send.', where: 'Settings → Your data', go: '/data' }] : []),
  ];
  const scanAgreed = st.doseScan?.on && st.doseScan.disclosure;

  const deleteAll = () =>
    Alert.alert('Delete everything on this phone?', 'All people, medicines, dose records, backups waiting to undo and photos are deleted. Save a backup first if you may want them back.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Save a backup first', onPress: () => router.push('/data') },
      {
        text: 'Delete everything',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Are you sure?', 'This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                for (const m of state.meds) deleteReferences([...(m.profile?.anchors ?? []), ...(m.profile?.refs ?? [])]);
                if (TRAINING_AVAILABLE) clearTraining();
                await clearSafetyCopy();
                // Reminders name the medicines: cancel them now, not after the notice is accepted again.
                await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
                await Notifications.dismissAllNotificationsAsync().catch(() => {});
                replaceAll({ version: 1, members: [newMember('Me', 0)], meds: [], logs: [], stock: [], settings: DEFAULT_SETTINGS });
              },
            },
          ]),
      },
    ]);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <Text style={{ color: t.text, fontSize: 22, fontWeight: '800', lineHeight: 29 }}>{PRIVACY_HEADLINE}</Text>

      <Label>Where your data is</Label>
      <Card>
        {dataPoints(Platform.OS).map(bullet)}
        <Text style={{ color: t.text, fontSize: 17, fontWeight: '700', marginTop: 16 }}>It leaves the phone only when you choose:</Text>
        {leaves.map((l) => (
          <View key={l.what} style={{ marginTop: 12 }}>
            <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>{l.what}</Text>
            <Text style={{ color: t.sub, fontSize: 15, lineHeight: 21 }}>
              {l.how} <Text onPress={() => router.push(l.go as never)} style={{ textDecorationLine: 'underline' }}>{l.where}</Text>
            </Text>
          </View>
        ))}
      </Card>

      <Label>What you've agreed to</Label>
      <Card>
        <Text style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>Terms of use and safety notice</Text>
        <Text style={{ color: t.sub, fontSize: 15, marginTop: 2 }}>
          {st.acceptedNoticeAt ? `Agreed on ${day(st.acceptedNoticeAt)}` : (st.acceptedNotice ?? 0) >= NOTICE_VERSION ? 'Agreed' : 'Not agreed yet'} · terms version {TERMS_VERSION}
        </Text>
        <More title="Read it">
          {TERMS_POINTS.map(bullet)}
          <Button title="Full terms of use" kind="ghost" onPress={() => Linking.openURL(TERMS_URL)} />
        </More>

        <Text style={{ color: t.text, fontSize: 17, fontWeight: '700', marginTop: 16 }}>Scanning at dose time</Text>
        <Text style={{ color: t.sub, fontSize: 15, marginTop: 2 }}>
          {doseScanOn(st)
            ? scanAgreed
              ? `On · notice read on ${day(st.doseScan!.at)}`
              : 'On'
            : setUpInUS(st)
              ? 'Off (set up in the US) · turn on after reading the notice'
              : 'Off'}
        </Text>
        <More title="Read it">
          {DOSE_SCAN_DISCLOSURE.map(bullet)}
          {doseScanOn(st) ? (
            <Button
              title="Turn scanning off"
              kind="ghost"
              onPress={() => saveSettings({ ...st, doseScan: { on: false, at: new Date().toISOString(), disclosure: st.doseScan?.disclosure } })}
            />
          ) : (
            <Button title="Turn it on (Scanning)" kind="ghost" onPress={() => router.push('/scanning')} />
          )}
        </More>

        {TRAINING_AVAILABLE && (
          <>
            <Text style={{ color: t.text, fontSize: 17, fontWeight: '700', marginTop: 16 }}>Photos for improving the scanner</Text>
            <Text style={{ color: t.sub, fontSize: 15, marginTop: 2 }}>
              {st.collectConsent ? `Agreed on ${day(st.collectConsent)}${st.collectTraining ? ' · keeping photos from everyday scans' : ''}` : 'Not agreed'}
            </Text>
            {st.collectConsent && (
              <Button
                title="Withdraw: stop collecting"
                kind="ghost"
                onPress={() =>
                  Alert.alert('Stop collecting photos?', 'No more photos are kept. Photos already kept stay until you delete them in Your data.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Stop', onPress: () => saveSettings({ ...st, collectConsent: undefined, collectTraining: false }) },
                  ])
                }
              />
            )}
          </>
        )}
      </Card>

      <Label>What TakeSure is</Label>
      <Card>
        <Text style={{ color: t.text, fontSize: 18, fontWeight: '800', lineHeight: 25 }}>{SAFETY_HEADLINE}</Text>
        {SAFETY_POINTS.map(bullet)}
      </Card>

      <Label>Medicine lists in the app</Label>
      <Card>
        {bullet(`Hand-checked list: ${DRUGS.length} medicines.`)}
        {bullet(MEDICINES.built ? `Indian medicine list: ${MEDICINES.source}, ${MEDICINES.built}.` : 'Larger Indian medicine list: not included yet.')}
        {bullet(usListBuilt() ? `US medicine list: FDA NDC Directory of ${day(usListBuilt() + 'T12:00:00')}.` : 'US medicine list: not included in this version yet.')}
        <Text style={{ color: t.sub, fontSize: 15, marginTop: 8, lineHeight: 21 }}>Lists can be incomplete or out of date. Check every medicine against its label.</Text>
      </Card>

      <Button title="Full terms of use" kind="secondary" onPress={() => Linking.openURL(TERMS_URL)} style={{ marginTop: 16 }} />
      <Button title="Full privacy policy" kind="secondary" onPress={() => Linking.openURL(PRIVACY_URL)} style={{ marginTop: 10 }} />
      <Button title="Delete everything on this phone" kind="ghost" onPress={deleteAll} style={{ marginTop: 18 }} />
    </ScrollView>
  );
}
