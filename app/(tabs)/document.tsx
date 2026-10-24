// Full privacy policy or terms of use, from the text bundled in the app (works offline). ?doc=privacy | terms
import { useLocalSearchParams, useNavigation } from 'expo-router';
import React, { useLayoutEffect } from 'react';
import { ScrollView } from 'react-native';
import { LegalDoc } from '../../src/components/LegalDoc.tsx';

export default function DocumentScreen() {
  const { doc } = useLocalSearchParams<{ doc?: string }>();
  const kind = doc === 'terms' ? 'terms' : 'privacy';
  const navigation = useNavigation();
  useLayoutEffect(() => navigation.setOptions({ title: kind === 'terms' ? 'Terms of use' : 'Privacy policy' }), [navigation, kind]);
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <LegalDoc doc={kind} />
    </ScrollView>
  );
}
