import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../ui.tsx';

/**
 * The app's one Back button: big chevron + "Back", no pill or glass background.
 * Used by the pages above the bottom bar and by the pushed stack pages, so every Back looks the same.
 */
export function BackButton({ fallback = '/settings' }: { fallback?: string }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      hitSlop={8}
      onPress={() => (router.canGoBack() ? router.back() : router.navigate(fallback as never))}
      style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 12 }}
    >
      <Ionicons name="chevron-back" size={26} color={t.brand} />
      <Text style={{ color: t.brand, fontSize: 17, fontWeight: '700' }}>Back</Text>
    </Pressable>
  );
}

/**
 * Plain header for pushed stack pages (Check the strips, Scan to add, …).
 * Drawn in JS rather than by the system so iOS doesn't put its glass pill around Back.
 */
export function PlainHeader({ title }: { title: string }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top, backgroundColor: t.bg }}>
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ position: 'absolute', left: 96, right: 96, alignItems: 'center' }} pointerEvents="none">
          <Text numberOfLines={1} accessibilityRole="header" style={{ color: t.text, fontSize: 17, fontWeight: '600' }}>
            {title}
          </Text>
        </View>
        <BackButton />
      </View>
    </View>
  );
}
