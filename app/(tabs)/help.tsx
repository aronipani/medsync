import { router } from 'expo-router';
import React from 'react';
import { ScrollView, Text } from 'react-native';
import { buildLabel } from '../../src/buildInfo.ts';
import { ReportProblem } from '../../src/components/ReportProblem.tsx';
import { SettingsRow } from '../../src/components/SettingsRow.tsx';
import { Button, Card, Label, useTheme } from '../../src/ui.tsx';

export default function HelpPage() {
  const t = useTheme();
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      {/* First: how the app works (spec 22). */}
      <Card style={{ padding: 0, overflow: 'hidden', marginBottom: 8 }}>
        <SettingsRow icon="book-outline" title="How to use TakeSure" line="Medicine time, the three colours, when a scan fails" onPress={() => router.push('/howto')} last />
      </Card>
      <ReportProblem />
      <Label>Safety</Label>
      <Button title="Privacy & safety" kind="secondary" onPress={() => router.push('/privacy')} />
      <Text style={{ color: t.sub, textAlign: 'center', marginTop: 24 }}>TakeSure · free, no account, no ads</Text>
      <Text style={{ color: t.sub, textAlign: 'center', marginTop: 4, fontSize: 15 }} selectable>
        {buildLabel()}
      </Text>
    </ScrollView>
  );
}
