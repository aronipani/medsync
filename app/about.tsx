import Constants from 'expo-constants';
import React from 'react';
import { Linking, ScrollView, Text } from 'react-native';
import { SafetyText } from '../src/components/SafetyText.tsx';
import { ISSUES_URL, PRIVACY_URL } from '../src/legal.ts';
import { Button, Card, useTheme } from '../src/ui.tsx';

export default function About() {
  const t = useTheme();
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <Card>
        <SafetyText full />
      </Card>
      <Button title="Full privacy policy" kind="secondary" style={{ marginTop: 14 }} onPress={() => Linking.openURL(PRIVACY_URL)} />
      <Button title="Report a problem" kind="ghost" style={{ marginTop: 6 }} onPress={() => Linking.openURL(ISSUES_URL)} />
      <Text style={{ color: t.sub, textAlign: 'center', marginTop: 16 }}>MedSync {Constants.expoConfig?.version ?? ''} · free, no account, no ads</Text>
    </ScrollView>
  );
}
