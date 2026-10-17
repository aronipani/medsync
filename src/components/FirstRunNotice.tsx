import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NOTICE_VERSION } from '../legal.ts';
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
      </ScrollView>
      <View style={{ paddingHorizontal: 22 }}>
        <Button title="I understand" big onPress={() => saveSettings({ ...state.settings, acceptedNotice: NOTICE_VERSION })} />
      </View>
    </View>
  );
}
