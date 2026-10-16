import { router } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';
import { Button, Card, useTheme } from '../ui.tsx';

/** "Help train the scanner" — shown where a new user without medicines lands, e.g. friends collecting photos (spec 13). */
export function CollectCard() {
  const t = useTheme();
  return (
    <Card style={{ marginTop: 12 }}>
      <Text style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>Help train the strip scanner</Text>
      <Text style={{ color: t.sub, marginTop: 6, lineHeight: 20 }}>
        Photograph medicine strips — any medicine — and send the photos. Each one is scanned and labelled with the medicine name you give.
      </Text>
      <Button title="Collect strip photos" onPress={() => router.push('/import-photos')} style={{ marginTop: 12 }} />
    </Card>
  );
}
