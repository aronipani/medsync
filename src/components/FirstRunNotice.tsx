import React from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NOTICE_VERSION, PRIVACY_URL, TERMS_URL } from '../legal.ts';
import { inUnitedStates } from '../doseScan.ts';
import { useStore } from '../store.tsx';
import { Button, useTheme } from '../ui.tsx';
import { SafetyText } from './SafetyText.tsx';

/** Full-screen "Before you start" notice, shown until accepted (docs/specs/03-safety-and-privacy.md). */
export function FirstRunNotice() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { state, saveSettings } = useStore();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top, paddingBottom: insets.bottom + 12 }}>
      <ScrollView contentContainerStyle={{ padding: 22 }}>
        <Text maxFontSizeMultiplier={1.4} style={{ color: t.brand, fontSize: 30, fontWeight: '800', marginBottom: 4 }}>TakeSure</Text>
        <Text style={{ color: t.sub, fontSize: 16, marginBottom: 22 }}>Before you start</Text>
        <SafetyText />
        <Button title="Read the full terms of use" kind="ghost" onPress={() => Linking.openURL(TERMS_URL)} style={{ marginTop: 16 }} />
        <Button title="Read the privacy policy" kind="ghost" onPress={() => Linking.openURL(PRIVACY_URL)} />
      </ScrollView>
      <View style={{ paddingHorizontal: 22 }}>
        <Text style={{ color: t.sub, fontSize: 15, lineHeight: 21, marginBottom: 10, textAlign: 'center' }}>
          By pressing "I agree" you accept the terms of use and the safety notice above.
        </Text>
        <Button
          title="I agree"
          big
          onPress={() =>
            saveSettings({ ...state.settings, acceptedNotice: NOTICE_VERSION, acceptedNoticeAt: new Date().toISOString(), setupInUS: state.settings.setupInUS ?? inUnitedStates() })
          }
        />
      </View>
    </View>
  );
}
