import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect } from 'react';
import { ScrollView, Text } from 'react-native';
import { ageText, backupOverdue } from '../../src/backup.ts';
import { buildLabel } from '../../src/buildInfo.ts';
import { SettingsRow } from '../../src/components/SettingsRow.tsx';
import { doseScanOn } from '../../src/doseScan.ts';
import { useStore } from '../../src/store.tsx';
import { Card, useTheme } from '../../src/ui.tsx';

/**
 * Settings: one short list, each row a page with one job (spec 21).
 * Family · Reminders · Scanning · Your data · Privacy & safety · Help.
 */
export default function SettingsScreen() {
  const t = useTheme();
  const { state } = useStore();
  const params = useLocalSearchParams<{ tab?: string }>();
  // Old links to the sub-tabs open their new pages.
  useEffect(() => {
    if (params.tab === 'helper') router.replace('/scanning');
    else if (params.tab === 'timing') router.replace('/reminders');
  }, [params.tab]);
  const overdue = backupOverdue(state);
  const people = state.members.map((m) => m.name).join(', ');
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <SettingsRow icon="people-outline" title="Family" line={`${people} · share with family`} onPress={() => router.push('/family')} />
        <SettingsRow icon="notifications-outline" title="Reminders" line="Test reminder · fine-tune the times" onPress={() => router.push('/reminders')} />
        <SettingsRow
          icon="scan-outline"
          title="Scanning"
          line={`${doseScanOn(state.settings) ? 'On' : 'Off'} at dose time · check the strips`}
          onPress={() => router.push('/scanning')}
          last
        />
      </Card>
      <Card style={{ padding: 0, overflow: 'hidden', marginTop: 16 }}>
        <SettingsRow
          icon="folder-outline"
          title="Your data"
          line={overdue ? 'No backup for 30+ days' : `Backup: ${ageText(state.settings.lastBackupAt)} · history for the doctor`}
          warn={overdue}
          onPress={() => router.push('/data')}
        />
        <SettingsRow icon="lock-closed-outline" title="Privacy & safety" line="Stays on this phone · what you've agreed to" onPress={() => router.push('/privacy')} />
        <SettingsRow icon="help-circle-outline" title="Help" line="Report a problem · version" onPress={() => router.push('/help')} last />
      </Card>
      <Text style={{ color: t.sub, textAlign: 'center', marginTop: 28, fontSize: 14 }} selectable>
        TakeSure {buildLabel()}
      </Text>
    </ScrollView>
  );
}
