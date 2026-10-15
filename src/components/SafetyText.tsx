import React from 'react';
import { Text, View } from 'react-native';
import { DATA_POINTS, PRIVACY_HEADLINE, SAFETY_HEADLINE, SAFETY_POINTS } from '../legal.ts';
import { useTheme } from '../ui.tsx';

/** The safety and privacy points, used by the first-run notice and the About & safety page. */
export function SafetyText({ full }: { full?: boolean }) {
  const t = useTheme();
  const bullet = (x: string) => (
    <View key={x} style={{ flexDirection: 'row', marginTop: 8 }}>
      <Text style={{ color: t.text, fontSize: 16, width: 18 }}>•</Text>
      <Text style={{ color: t.text, fontSize: 16, lineHeight: 23, flex: 1 }}>{x}</Text>
    </View>
  );
  return (
    <View>
      <Text style={{ color: t.text, fontSize: 18, fontWeight: '800', lineHeight: 25 }}>{SAFETY_HEADLINE}</Text>
      {SAFETY_POINTS.map(bullet)}
      <Text style={{ color: t.text, fontSize: 18, fontWeight: '800', lineHeight: 25, marginTop: 22 }}>{PRIVACY_HEADLINE}</Text>
      {full ? DATA_POINTS.map(bullet) : bullet('Nothing is uploaded unless you share it yourself (a backup or a photo export).')}
    </View>
  );
}
