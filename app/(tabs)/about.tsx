import React from 'react';
import { Linking, ScrollView, Text } from 'react-native';
import { SafetyText } from '../../src/components/SafetyText.tsx';
import { buildLabel } from '../../src/buildInfo.ts';
import { PRIVACY_URL, TERMS_URL } from '../../src/legal.ts';
import { useStore } from '../../src/store.tsx';
import { usListBuilt } from '../../src/usLookup.ts';
import { Button, Card, useTheme } from '../../src/ui.tsx';

export default function About() {
  const t = useTheme();
  const { state } = useStore();
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <Card>
        <SafetyText full />
      </Card>
      <Button title="Full terms of use" kind="secondary" style={{ marginTop: 14 }} onPress={() => Linking.openURL(TERMS_URL)} />
      <Button title="Full privacy policy" kind="secondary" style={{ marginTop: 10 }} onPress={() => Linking.openURL(PRIVACY_URL)} />
      {state.settings.acceptedNoticeAt && (
        <Text style={{ color: t.sub, textAlign: 'center', marginTop: 12, fontSize: 15 }}>
          Terms agreed on this phone on {new Date(state.settings.acceptedNoticeAt).toLocaleDateString()}.
        </Text>
      )}
      <Text style={{ color: t.sub, textAlign: 'center', marginTop: 16, fontSize: 15, lineHeight: 21 }}>
        {usListBuilt()
          ? `US medicine list: FDA NDC Directory of ${new Date(usListBuilt() + 'T12:00:00').toLocaleDateString()}. It may be out of date — check every medicine against its label.`
          : 'US medicine list: not included in this version yet.'}
      </Text>
      <Text style={{ color: t.sub, textAlign: 'center', marginTop: 16 }}>TakeSure · free, no account, no ads</Text>
      <Text style={{ color: t.sub, textAlign: 'center', marginTop: 4, fontSize: 15 }} selectable>
        {buildLabel()}
      </Text>
    </ScrollView>
  );
}
