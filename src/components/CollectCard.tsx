import { router } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import { Button, useTheme } from '../ui.tsx';

/**
 * A quiet way in for friends who help by photographing strips (spec 13), shown only to a new user with no medicines,
 * below "Add a medicine" — so a patient setting up the app isn't distracted by it.
 */
export function CollectCard() {
  const t = useTheme();
  return (
    <View style={{ marginTop: 24, alignItems: 'center' }}>
      <Text style={{ color: t.sub, fontSize: 15 }}>Helping to improve the scanner?</Text>
      <Button title="Collect strip photos" kind="ghost" onPress={() => router.push('/import-photos')} />
    </View>
  );
}
